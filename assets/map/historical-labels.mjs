/** Display-label correction; upstream geometry/properties remain available unchanged.
 * GPL-3.0, accompanying the derived historical-basemaps map.
 */
export function historicalName(name) {
 return name === 'Austrian Empire' ? 'Habsburg lands' : String(name || 'Unlabelled territory');
}
