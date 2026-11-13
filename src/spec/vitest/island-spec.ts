import * as ex from '@excalibur';
import { getDefaultPhysicsConfig } from '../../engine/collision/physics-config';
import { buildContactIslands } from '../../engine/collision/island';

describe('A contact Island', () => {
  const makeStack = () => {
    const bottom = new ex.Actor({ x: 0, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const top = new ex.Actor({ x: 0, y: -38, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    bottom.body.canSleep = true;
    top.body.canSleep = true;
    bottom.collider.update();
    top.collider.update();
    // the motion system normally captures these before integrating, without them a body looks like it moved from the origin
    bottom.body.captureOldTransform();
    top.body.captureOldTransform();
    const contacts = bottom.collider.collide(top.collider);
    expect(contacts.length).toBe(1);
    return { bottom, top, contacts };
  };

  it('groups bodies connected through contacts', () => {
    const { bottom, top, contacts } = makeStack();
    const islands = buildContactIslands(getDefaultPhysicsConfig().bodies, [bottom.body, top.body], contacts);
    expect(islands.length).toBe(1);
    expect(islands[0].bodies).toContain(bottom.body);
    expect(islands[0].bodies).toContain(top.body);
  });

  it('gives each island its own bodies and contacts, once each', () => {
    const { bottom, top, contacts } = makeStack();
    const floor = new ex.Actor({ x: 0, y: 39, width: 100, height: 40, collisionType: ex.CollisionType.Fixed });
    floor.collider.update();
    const floorContacts = floor.collider.collide(bottom.collider);
    expect(floorContacts.length).toBe(1);
    const lone = new ex.Actor({ x: 500, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const allContacts = [...contacts, ...floorContacts];

    const islands = buildContactIslands(getDefaultPhysicsConfig().bodies, [floor.body, bottom.body, top.body, lone.body], allContacts);

    expect(islands.length).toBe(2);
    const stack = islands.find((island) => island.bodies.includes(top.body))!;
    expect(stack.bodies).toHaveLength(2);
    expect(stack.bodies).toContain(bottom.body);
    expect(stack.contacts).toHaveLength(2);
    expect(stack.contacts).toEqual(expect.arrayContaining(allContacts));
    expect(bottom.body.island).toBe(stack);
    expect(top.body.island).toBe(stack);
    const alone = islands.find((island) => island.bodies.includes(lone.body))!;
    expect(alone.bodies).toEqual([lone.body]);
    expect(alone.contacts).toEqual([]);
    expect(floor.body.island).toBeNull();
  });

  it('builds islands again from scratch once the contacts are gone', () => {
    const { bottom, top, contacts } = makeStack();
    buildContactIslands(getDefaultPhysicsConfig().bodies, [bottom.body, top.body], contacts);

    const islands = buildContactIslands(getDefaultPhysicsConfig().bodies, [bottom.body, top.body], []);

    expect(islands.length).toBe(2);
    expect(bottom.body.island).not.toBe(top.body.island);
    expect(islands.map((island) => island.contacts.length)).toEqual([0, 0]);
  });

  it('wakes every body when the island is only partially asleep', () => {
    const { bottom, top, contacts } = makeStack();
    bottom.body.sleep();
    expect(bottom.body.isSleeping).toBe(true);
    expect(top.body.isSleeping).toBe(false);

    const [island] = buildContactIslands(getDefaultPhysicsConfig().bodies, [bottom.body, top.body], contacts);
    island.updateSleepState(16);

    expect(bottom.body.isSleeping).toBe(false);
    expect(top.body.isSleeping).toBe(false);
  });

  it('leaves a fully sleeping island asleep', () => {
    const { bottom, top, contacts } = makeStack();
    bottom.body.sleep();
    top.body.sleep();

    const [island] = buildContactIslands(getDefaultPhysicsConfig().bodies, [bottom.body, top.body], contacts);
    island.updateSleepState(16);

    expect(bottom.body.isSleeping).toBe(true);
    expect(top.body.isSleeping).toBe(true);
  });
});
