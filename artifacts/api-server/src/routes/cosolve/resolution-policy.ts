export function requiresResolutionApproval(
  current: { status: string; recommendedAmount: number },
  update: { status?: string; recommendedAmount?: number },
): boolean {
  return (
    ["Resolved", "Closed"].includes(update.status ?? "") &&
    (update.recommendedAmount ?? current.recommendedAmount) > 0
  );
}
