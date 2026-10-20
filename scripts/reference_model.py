#!/usr/bin/env python3
"""
Independent reference implementation of the PRD section 5 calculation contract.

Written directly from the PRD formulas, in a different language and without sharing
code with src/domain, so the TypeScript engine can be checked against it. It is
deliberately plain: one loop per loan, no vectorization, Python floats (IEEE 754
double, same as JavaScript).

Run:  python3 -I scripts/reference_model.py   (writes tests/fixtures/reference-*.json)
"""
import json
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "fixtures")

SEASONAL = [0.8, 0.8, 0.95, 1.05, 1.15, 1.2, 1.2, 1.15, 1.05, 0.95, 0.85, 0.85]


def payment(b, annual, n):
    r = annual / 12.0
    if r == 0:
        return b / n
    return b * r / (1 - (1 + r) ** (-n))


def cpr_to_smm(c):
    return 1 - (1 - c) ** (1 / 12.0)


def smm_to_cpr(s):
    return 1 - (1 - s) ** 12


def sigmoid(z):
    return 1 / (1 + math.exp(-z))


def calendar_index(as_of, k):
    y, m = map(int, as_of.split("-"))
    idx = y * 12 + (m - 1) + k
    return idx % 12


def offer_at(rp, t):
    shock = rp["shockBps"] / 10000.0
    level = rp["offerRate"]
    factor = 1.0
    if rp["shape"] == "ramp12":
        factor = min(t, 12) / 12.0
    if rp["shape"] == "custom":
        path = rp["customPath"]
        level = path[min(t - 1, len(path) - 1)]
    return level + shock * factor


def project_loan(loan, sc):
    """Return list of per-month dicts of expected values for one loan."""
    n = loan["remainingTerm"]
    r = loan["noteRate"] / 12.0
    a_pay = loan["contractualPayment"]
    fee_bps = sc["feeOverrideBps"] if sc["feeOverrideBps"] is not None else loan["servicingFeeBps"]
    cost = sc["costPerLoan"] if sc["costPerLoan"] is not None else loan["annualCost"]
    w, bal, exposure = 1.0, loan["currentBalance"], 0
    rows = []
    for t in range(1, n + 1):
        age = loan["ageMonths"] + t
        interest = bal * r
        final = t == n
        sched = bal if final else min(bal, max(0.0, a_pay - interest))
        rem = bal - sched
        q = q_refi = q_move = 0.0
        mode = sc["mode"]
        if mode == "fixedCpr" and not final:
            q = cpr_to_smm(sc["fixedCpr"])
            q_move = q
        elif mode == "psa" and not final:
            q = cpr_to_smm(min(1.0, min(0.002 * age, 0.06) * sc["psaPercent"] / 100.0))
            q_move = q
        elif mode == "behavioral":
            bp = sc["behavioral"]
            season = SEASONAL[calendar_index(sc["valuationMonth"], t)] if bp["seasonality"] == "seasonal" else 1.0
            h_move = 0.003 * bp["turnoverMultiplier"] * season
            x = (loan["noteRate"] - offer_at(sc["ratePath"], t)) * 10000 - bp["frictionBps"]
            if abs(x) < 1e-6:  # floating-point noise at the threshold counts as zero incentive
                x = 0.0
            s = min(age / 30.0, 1.0)
            burn = math.exp(-0.02 * exposure) if bp["burnout"] else 1.0
            h_refi = 0.04 * bp["refiMultiplier"] * loan["refiPropensity"] * s * burn * sigmoid(x / 50.0)
            if not final and h_move + h_refi > 0:
                q = 1 - math.exp(-(h_move + h_refi))
                q_refi = q * h_refi / (h_move + h_refi)
                q_move = q * h_move / (h_move + h_refi)
            if x > 0:
                exposure += 1
        rows.append({
            "t": t,
            "beg": w * bal,
            "sched": w * sched,
            "prep": w * rem * q,
            "end": w * rem * (1 - q),
            "interest": w * interest,
            "count": w,
            # Only behavioral mode identifies causes; fixed CPR and PSA payoffs are unclassified.
            "volN": w * q,
            "refiN": w * q_refi if sc["mode"] == "behavioral" else None,
            "unclN": 0.0 if sc["mode"] == "behavioral" else w * q,
            "fee": w * bal * fee_bps / 10000.0 / 12.0,
            "cost": w * cost / 12.0,
        })
        w = 0.0 if final else w * (1 - q)
        bal = rem
    return rows


def project_portfolio(loans, sc):
    horizon = max(l["remainingTerm"] for l in loans)
    keys = ["beg", "sched", "prep", "end", "interest", "count", "volN", "refiN", "unclN", "fee", "cost"]
    tot = [{k: 0.0 for k in keys} for _ in range(horizon)]
    for loan in loans:
        for row in project_loan(loan, sc):
            for k in keys:
                if row[k] is None:
                    tot[row["t"] - 1][k] = None
                else:
                    tot[row["t"] - 1][k] += row[k]
    d = sc["discountRate"]
    ledger, npv, wal_num = [], 0.0, 0.0
    recap_pv = 0.0
    upb0 = sum(l["currentBalance"] for l in loans)
    for i, m in enumerate(tot):
        t = i + 1
        elig = m["beg"] - m["sched"]
        smm = None if elig == 0 else m["prep"] / elig
        net = m["fee"] - m["cost"]
        df = (1 + d) ** (-t / 12.0)
        npv += net * df
        wal_num += (t / 12.0) * (m["sched"] + m["prep"])
        if sc["mode"] == "behavioral":
            rec = m["refiN"] * sc["recapture"]["share"]
            recap_pv += rec * sc["recapture"]["contributionPerLoan"] * df
        ledger.append({**m, "t": t, "smm": smm, "cpr": None if smm is None else smm_to_cpr(smm), "net": net})
    smms = [m["smm"] for m in ledger[:12] if m["smm"] is not None]
    surv = 1.0
    for s in smms:
        surv *= 1 - s
    cpr12 = 1 - surv ** (12 / len(smms)) if smms else None
    summary = {
        "currentUpb": upb0,
        "nextMonthCpr": ledger[0]["cpr"],
        "cpr12": cpr12,
        "prepaid12": sum(m["prep"] for m in ledger[:12]),
        "scheduled12": sum(m["sched"] for m in ledger[:12]),
        "netServicing12": sum(m["net"] for m in ledger[:12]),
        "servicingNpv": npv,
        "servicingValueBps": npv / upb0 * 10000,
        "wal": wal_num / upb0,
        "lifetimePrepaid": sum(m["prep"] for m in ledger),
        "lifetimeScheduled": sum(m["sched"] for m in ledger),
        "recapturePv": (recap_pv - sc["recapture"]["campaignCost"]) if sc["mode"] == "behavioral" else None,
    }
    return ledger, summary


def mk_loan(i, orig, rate, age, prop, fee=25, cost=100.0, term=360, state="TX"):
    pay = payment(orig, rate, term)
    b = orig
    for _ in range(age):
        intr = b * rate / 12
        b -= min(b, max(0.0, pay - intr))
    return {
        "id": f"REF-{i:03d}", "asOfMonth": "2026-09", "originalBalance": orig, "currentBalance": b,
        "noteRate": rate, "originalTerm": term, "ageMonths": age, "remainingTerm": term - age,
        "contractualPayment": pay, "servicingFeeBps": fee, "annualCost": cost, "state": state,
        "refiPropensity": prop, "cohort": "reference",
    }


def scenario(**over):
    sc = {
        "mode": "behavioral", "valuationMonth": "2026-09",
        "ratePath": {"offerRate": 0.0625, "shockBps": 0, "shape": "immediate", "customPath": []},
        "behavioral": {"turnoverMultiplier": 1, "refiMultiplier": 1, "frictionBps": 50, "burnout": True, "seasonality": "flat"},
        "fixedCpr": 0.08, "psaPercent": 100,
        "feeOverrideBps": None, "costPerLoan": None, "discountRate": 0.10,
        "recapture": {"share": 0.2, "contributionPerLoan": 1500, "campaignCost": 0},
    }
    for k, v in over.items():
        sc[k] = v
    return sc


def pick(ledger, months):
    return [ledger[m - 1] for m in months if m <= len(ledger)]


def write(name, loans, sc, months):
    ledger, summary = project_portfolio(loans, sc)
    doc = {
        "provenance": "Generated by scripts/reference_model.py, an independent Python implementation of PRD section 5. "
                      "Not produced by the TypeScript engine.",
        "loans": loans,
        "scenario": sc,
        "ledgerMonths": pick(ledger, months),
        "horizon": len(ledger),
        "summary": summary,
    }
    with open(os.path.join(OUT, f"reference-{name}.json"), "w") as f:
        json.dump(doc, f, indent=1)


def main():
    os.makedirs(OUT, exist_ok=True)
    one = [mk_loan(1, 300000.0, 0.065, 12, 1.0)]
    write("one-loan-fixed", one, scenario(mode="fixedCpr", fixedCpr=0.06), [1, 2, 12, 60, 347, 348])
    write("one-loan-behavioral", one,
          scenario(ratePath={"offerRate": 0.0625, "shockBps": -100, "shape": "ramp12", "customPath": []}),
          [1, 6, 12, 13, 40, 348])
    multi = [
        mk_loan(1, 250000.0, 0.03, 60, 0.8, state="CA"),
        mk_loan(2, 410000.0, 0.03625, 54, 1.2, state="FL"),
        mk_loan(3, 380000.0, 0.05, 30, 1.0, state="TX"),
        mk_loan(4, 520000.0, 0.05375, 26, 0.6, cost=140.0, state="NY"),
        mk_loan(5, 600000.0, 0.07, 6, 1.4, state="CA"),
        mk_loan(6, 180000.0, 0.0775, 3, 1.1, fee=50, state="OH"),
    ]
    write("multi-behavioral", multi,
          scenario(ratePath={"offerRate": 0.0625, "shockBps": -150, "shape": "ramp12", "customPath": []},
                   behavioral={"turnoverMultiplier": 1.2, "refiMultiplier": 1.3, "frictionBps": 40, "burnout": True, "seasonality": "seasonal"},
                   recapture={"share": 0.35, "contributionPerLoan": 1800, "campaignCost": 2500}),
          [1, 2, 3, 12, 24, 36, 120, 300, 334, 357])
    write("multi-custom-path", multi,
          scenario(ratePath={"offerRate": 0.0625, "shockBps": 25, "shape": "custom", "customPath": [0.06, 0.055, 0.05, 0.045, 0.05, 0.06]},
                   behavioral={"turnoverMultiplier": 0.8, "refiMultiplier": 1.0, "frictionBps": 50, "burnout": False, "seasonality": "flat"},
                   costPerLoan=250.0, discountRate=0.12),
          [1, 4, 6, 7, 30, 200])
    write("multi-psa", multi, scenario(mode="psa", psaPercent=150, feeOverrideBps=30), [1, 10, 24, 25, 30, 100, 357])
    edge = [
        mk_loan(1, 120000.0, 0.0, 0, 1.0, term=360),
        {**mk_loan(2, 1000.0, 0.06, 0, 1.0, term=1), "ageMonths": 0},
    ]
    write("edge-zero-rate", edge, scenario(mode="fixedCpr", fixedCpr=0.1, discountRate=0.0), [1, 2, 359, 360])


if __name__ == "__main__":
    main()
