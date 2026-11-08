// #105: the bottom part of the layout viewport the visual viewport does not show, which is
// what an on-screen keyboard covers (iOS keeps the layout viewport and shrinks only the
// visual one; Android Chrome does the same by default).
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number },
) {
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop));
}
