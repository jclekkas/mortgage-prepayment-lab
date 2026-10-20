import { num, usd } from '../../domain/format';
import type { RunOutput, ScenarioInput } from '../../domain/types';
import { TermHelp } from '../../ui/TermHelp';

export function RecapturePanel({ out, input, baseOut }: { out: RunOutput; input: ScenarioInput; baseOut: RunOutput | null }) {
  const s = out.summary;
  return (
    <section className="card" aria-labelledby="recap-h" data-testid="recapture-panel">
      <div>
        <h3 id="recap-h" style={{ display: 'inline' }}>Recapture overlay (business decision)</h3>
        <TermHelp id="recapture" />
      </div>
      {input.mode !== 'behavioral' ? (
        <p className="muted">
          Not available in {input.mode === 'psa' ? 'the PSA benchmark' : 'the fixed-rate'} mode: these modes do not say whether a payoff was a refinance or a move, so there is nothing to recapture.
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Original book versus recapture contribution</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">This scenario</th>
                  {baseOut && baseOut.summary.recapturePv !== null && <th scope="col">Baseline</th>}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Original-book illustrative servicing NPV</th>
                  <td>{usd(s.servicingNpv, { compact: true })}</td>
                  {baseOut && baseOut.summary.recapturePv !== null && <td>{usd(baseOut.summary.servicingNpv, { compact: true })}</td>}
                </tr>
                <tr>
                  <th scope="row">Expected recaptured refinance loans (lifetime)</th>
                  <td>{num(s.recapturedLoans, 1)}</td>
                  {baseOut && baseOut.summary.recapturePv !== null && <td>{num(baseOut.summary.recapturedLoans, 1)}</td>}
                </tr>
                <tr>
                  <th scope="row">Recapture contribution in today’s dollars (after campaign cost)</th>
                  <td>{usd(s.recapturePv, { compact: true })}</td>
                  {baseOut && baseOut.summary.recapturePv !== null && <td>{usd(baseOut.summary.recapturePv, { compact: true })}</td>}
                </tr>
                <tr>
                  <th scope="row">Combined contribution (illustrative, not the fair value of the mortgage servicing right)</th>
                  <td>{usd(s.combinedContribution, { compact: true })}</td>
                  {baseOut && baseOut.summary.recapturePv !== null && <td>{usd(baseOut.summary.combinedContribution, { compact: true })}</td>}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Recapture is new origination income from refinancing borrowers who would have left anyway: {Math.round(input.recaptureParameters.share * 100)}% of expected refinance payoffs × {usd(input.recaptureParameters.contributionPerLoan)} each, discounted, minus a one-time {usd(input.recaptureParameters.campaignCost)} campaign cost.
            The original loans still pay off and their fees still stop. No replacement servicing value is included, and an assumed uplift is not proof that a campaign causes it.
          </p>
        </>
      )}
    </section>
  );
}
