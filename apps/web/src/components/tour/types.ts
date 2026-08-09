/** One stop on a guided walkthrough. */
export interface TourStep {
  /**
   * The `data-tour` value of the element to spotlight. Leave it off for a step
   * that has nothing to point at — an opening or closing card — and the tooltip
   * sits in the middle of a plain dimmed screen.
   *
   * A target that isn't on the page when the tour opens drops the step rather
   * than stranding the learner on an empty highlight.
   */
  target?: string;
  title: string;
  body: string;
}
