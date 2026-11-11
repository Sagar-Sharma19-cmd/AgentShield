/**
 * At 768 px and below, grows a 32 px icon button's hit area to 44 px (WCAG 2.5.5 / Apple HIG) with an invisible
 * pseudo-element, so the visual size stays 32 px. Neighbours need at least a 12 px gap so hit areas do not overlap.
 */
export const TOUCH_TARGET = "relative max-md:after:absolute max-md:after:-inset-1.5 max-md:after:rounded-md";
