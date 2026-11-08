// #105: the bottom part of the layout viewport the visual viewport does not show, which is
// what an on-screen keyboard covers (iOS keeps the layout viewport and shrinks only the
// visual one; Android Chrome does the same by default). Pinch zoom also shrinks the visual
// viewport and moves offsetTop while panning, so a zoomed page counts as no keyboard.
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number; scale?: number },
) {
  if ((viewport.scale ?? 1) > 1.01) return 0;
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop));
}
