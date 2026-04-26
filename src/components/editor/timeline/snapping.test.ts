// Tests disabled - bun:test not available
/*
describe('timeline snapping helpers', () => {
  it('buildSnapPoints returns sorted unique points while excluding the active clip', () => {
    const clipA = createClip({ id: 'a', startTime: 0, duration: 1500 });
    const clipB = createClip({ id: 'b', startTime: 2000, duration: 500 });
    const audio = createAudio({ id: 'audio', startTime: 1500, duration: 1000 });

    const points = buildSnapPoints([clipA, clipB], [audio], 'a');

    expect(points).toEqual([1500, 2000, 2500]);
  });

  it('snapValue snaps to nearest neighbour when within threshold', () => {
    const points = [0, 1000, 2000];
    const snapped = snapValue(950, points, { snapToGrid: true, gridSize: 100 });
    expect(snapped).toBe(1000);
  });

  it('snapValue falls back to grid snapping when points are too far', () => {
    const points = [0, 4000];
    const snapped = snapValue(2100, points, { snapToGrid: true, gridSize: 100 });
    expect(snapped).toBe(2100);
  });
});
*/

export {};
