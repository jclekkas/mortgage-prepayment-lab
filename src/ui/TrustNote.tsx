/** What has and has not been established about the numbers, in plain words. Never a "validated" badge. */
export function TrustNote({ compact }: { compact?: boolean }) {
  return (
    <div className={`trust-note${compact ? ' compact' : ''}`} data-testid="trust-note">
      <strong>How far to trust these numbers:</strong>{' '}
      <span><em>Arithmetic checked</em>: formulas are tested against hand-worked examples and an independent re-implementation.</span>{' '}
      <span><em>Assumptions illustrative</em>: the loans are synthetic and the borrower-behavior settings are teaching values, not calibrated.</span>{' '}
      <span><em>Real-world accuracy not established</em>: the model has not been tested against real loan outcomes or reviewed by a mortgage modeling professional.</span>
    </div>
  );
}
