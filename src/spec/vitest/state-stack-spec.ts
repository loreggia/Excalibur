import * as ex from '@excalibur';
import { StateStack } from '../../engine/graphics/context/state-stack';

describe('A graphics context StateStack', () => {
  it('starts a saved state from the current one', () => {
    const sut = new StateStack();
    const red = ex.Color.Red;
    sut.current.tint = red;
    sut.current.opacity = 0.5;
    sut.current.z = 3;

    sut.save();

    expect(sut.current.tint).toEqual(red);
    expect(sut.current.opacity).toBe(0.5);
    expect(sut.current.z).toBe(3);
  });

  it('brings back the tint, opacity and z of each saved state on restore, through nested saves', () => {
    const sut = new StateStack();
    const red = ex.Color.Red;
    const blue = ex.Color.Blue;
    const green = ex.Color.Green;
    sut.current.tint = red;
    sut.current.opacity = 1;

    sut.save();
    sut.current.tint = blue;
    sut.current.opacity = 0.5;
    sut.save();
    sut.current.tint = green;
    sut.current.z = 7;

    sut.restore();
    expect(sut.current.tint).toBe(blue);
    expect(sut.current.opacity).toBe(0.5);
    expect(sut.current.z).toBe(0);

    sut.restore();
    expect(sut.current.tint).toBe(red);
    expect(sut.current.opacity).toBe(1);
  });

  it('never changes a tint it handed out when the next save() reuses the pooled state', () => {
    // queued draw calls hold on to the tint they were drawn with until the frame is flushed
    const sut = new StateStack();
    sut.current.tint = ex.Color.Red;
    sut.save();
    const drawnWith = sut.current.tint;
    sut.restore();

    sut.current.tint = ex.Color.Blue;
    sut.save();

    expect(drawnWith).toEqual(ex.Color.Red);
  });
});
