import * as ex from '@excalibur';

import { TestUtils } from '../__util__/test-utils';
import { getDefaultPhysicsConfig } from '../../engine/collision/physics-config';

describe('An ArcadeSolver', () => {
  it('should exist', () => {
    expect(ex.ArcadeSolver).toBeDefined();
  });

  it('should only solve position for overlapping contacts', () => {
    const wall1 = new ex.Actor({ x: 0, y: 0, width: 100, height: 100, collisionType: ex.CollisionType.Fixed });
    const wall2 = new ex.Actor({ x: 100, y: 0, width: 100, height: 100, collisionType: ex.CollisionType.Fixed });

    const player = new ex.Actor({ x: 50, y: 99, width: 100, height: 100, collisionType: ex.CollisionType.Active });

    const pair1 = new ex.Pair(player.collider.get()!, wall1.collider.get()!);
    const pair2 = new ex.Pair(player.collider.get()!, wall2.collider.get()!);

    const contacts = [...pair1.collide(), ...pair2.collide()];
    expect(contacts.length).toBe(2);

    const sut = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);

    for (const contact of contacts) {
      sut.solvePosition(contact);
    }

    // Each contact has the same mtv
    expect(contacts[0].mtv).toBeVector(ex.vec(0, -1));
    expect(contacts[1].mtv).toBeVector(ex.vec(0, -1));

    // Only 1 contact mtv is applied
    expect(player.pos.y).toBe(100);
    expect(player.pos.x).toBe(50);
  });

  it('should not catch on a seam (left/right)', async () => {
    const game = TestUtils.engine({
      width: 1000,
      height: 1000,
      physics: {
        gravity: new ex.Vector(0, 800)
      }
    });
    const clock = game.clock as ex.TestClock;
    await TestUtils.runToReady(game);
    // many small tiles
    for (let x = 0; x < 500; x += 16) {
      game.add(
        new ex.Actor({
          name: 'floor-tile',
          x,
          y: 300,
          width: 16,
          height: 16,
          color: ex.Color.Green,
          collisionType: ex.CollisionType.Fixed
        })
      );
    }

    const player = new ex.Actor({
      x: 100,
      y: 100,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });

    // place player on tiles
    player.pos.y = 270;
    game.add(player);

    // run simulation and ensure now left/right contacts are generated
    player.on('postcollision', (evt) => {
      expect(evt.side).not.toBe(ex.Side.Left);
      expect(evt.side).not.toBe(ex.Side.Right);
      expect(evt.side).toBe(ex.Side.Bottom);
    });

    for (let i = 0; i < 10; i++) {
      clock.step(16);
    }

    game.dispose();
  });

  it('should cancel collision contacts where there is no more overlap', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);

    const player = new ex.Actor({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });
    player.vel = ex.vec(0, 10); // moving away from the contact

    const block = new ex.Actor({
      x: 0,
      y: 39,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Fixed,
      color: ex.Color.Green
    });

    // 1 pixel overlap
    const contact = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down,
      ex.Vector.Down,
      ex.Vector.Down.perpendicular(),
      [],
      [],
      null as any
    );
    arcadeSolver.solvePosition(contact);
    expect(player.pos).toBeVector(ex.vec(0, -1));

    // No more overlap
    const contact2 = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down,
      ex.Vector.Down,
      ex.Vector.Down.perpendicular(),
      [],
      [],
      null as any
    );
    arcadeSolver.solvePosition(contact2);
    expect(contact2.isCanceled).toBe(true);
  });

  it('should NOT cancel collisions where the bodies are moving away from the contact', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);

    const player = new ex.Actor({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });
    player.vel = ex.vec(0, -10); // moving away from the contact

    const block = new ex.Actor({
      x: 39,
      y: 39,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Fixed,
      color: ex.Color.Green
    });

    // Player moving away from contact
    const contact = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down,
      ex.Vector.Down,
      ex.Vector.Up.perpendicular(),
      [],
      [],
      null as any
    );
    arcadeSolver.solveVelocity(contact);
    expect(contact.isCanceled).toBe(false);
    expect(player.vel).toBeVector(ex.vec(0, -10)); // Velocity is not adjusted

    // Player moving towards contact
    player.vel = player.vel.negate();
    const contact2 = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down,
      ex.Vector.Down,
      ex.Vector.Down.perpendicular(),
      [],
      [],
      null as any
    );

    arcadeSolver.solveVelocity(contact2);
    expect(contact2.isCanceled).toBe(false);
    expect(player.vel).toBeVector(ex.Vector.Zero); // Velocity is adjusted
  });

  it('should cancel near zero mtv collisions', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);

    const player = new ex.Actor({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });

    const block = new ex.Actor({
      x: 39.9999,
      y: 39.9999,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Fixed,
      color: ex.Color.Green
    });

    const contact = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down.scale(0.00009),
      ex.Vector.Down,
      ex.Vector.Up.perpendicular(),
      [],
      [],
      null as any
    );

    arcadeSolver.solvePosition(contact);

    expect(contact.isCanceled).toBe(true);
  });

  it('should cancel near zero overlap collisions', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);

    const player = new ex.Actor({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });

    const block = new ex.Actor({
      x: 40,
      y: 0,
      width: 40 + 0.00005,
      height: 40,
      collisionType: ex.CollisionType.Fixed,
      color: ex.Color.Green
    });

    const contact = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down,
      ex.Vector.Down,
      ex.Vector.Up.perpendicular(),
      [],
      [],
      null as any
    );

    arcadeSolver.solvePosition(contact);
    // Considers infinitesimally overlapping to no longer be overlapping and thus cancels the contact
    expect(contact.isCanceled).toBe(true);
  });

  it('should cancel zero overlap collisions during presolve', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);

    const player = new ex.Actor({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });

    const block = new ex.Actor({
      x: 40,
      y: 0,
      width: 40 + 0.00005,
      height: 40,
      collisionType: ex.CollisionType.Fixed,
      color: ex.Color.Green
    });

    const contact = new ex.CollisionContact(
      player.collider.get()!,
      block.collider.get()!,
      ex.Vector.Down,
      ex.Vector.Down,
      ex.Vector.Up.perpendicular(),
      [],
      [],
      null as any
    );

    contact.mtv = ex.vec(-0, 0);

    arcadeSolver.preSolve([contact]);
    // Considers infinitesimally overlapping to no longer be overlapping and thus cancels the contact
    expect(contact.isCanceled).toBe(true);
  });

  it('should allow solver bias and solve certain contacts first', async () => {
    const game = TestUtils.engine({
      width: 1000,
      height: 1000,
      fixedUpdateFps: 60,
      physics: {
        gravity: ex.vec(0, 5000),
        solver: ex.SolverStrategy.Arcade,
        arcade: {
          contactSolveBias: ex.ContactSolveBias.VerticalFirst
        }
      }
    });
    const clock = game.clock as ex.TestClock;
    await TestUtils.runToReady(game);
    // big tiles so distance heuristic doesn't work
    const lastPos = ex.vec(0, 0);
    for (let x = 0; x < 10; x++) {
      const width = x % 2 === 1 ? 16 : 200;
      game.add(
        new ex.Actor({
          name: 'floor-tile',
          x: lastPos.x,
          y: 300,
          width: width,
          height: x % 2 ? 16 : 900,
          anchor: ex.Vector.Zero,
          color: ex.Color.Red,
          collisionType: ex.CollisionType.Fixed
        })
      );
      lastPos.x += width;
    }

    const player = new ex.Actor({
      pos: ex.vec(100, 270),
      width: 16,
      height: 16,
      collisionType: ex.CollisionType.Active,
      color: ex.Color.Red
    });

    // place player on tiles
    player.vel.x = 164;
    game.add(player);

    // run simulation and ensure now left/right contacts are generated
    player.on('postcollision', (evt) => {
      expect(evt.side).not.toBe(ex.Side.Left);
      expect(evt.side).not.toBe(ex.Side.Right);
      expect(evt.side).toBe(ex.Side.Bottom);
    });

    for (let i = 0; i < 40; i++) {
      clock.step(16);
    }

    game.dispose();
  });
  it('removes only the velocity going into the contact from both active bodies', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);
    const normal = ex.vec(0.6, 0.8);
    const bodyA = new ex.Actor({ x: 0, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const bodyB = new ex.Actor({ x: 30, y: 30, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const contactFor = () =>
      new ex.CollisionContact(
        bodyA.collider.get()!,
        bodyB.collider.get()!,
        normal.scale(5),
        normal,
        normal.perpendicular(),
        [],
        [],
        null as any
      );

    // A moves into B (along the normal) and B moves into A (against it): the parts along the normal go
    bodyA.vel = ex.vec(10, 5);
    bodyB.vel = ex.vec(-4, -7);
    const velA = bodyA.vel;
    arcadeSolver.solveVelocity(contactFor());
    expect(bodyA.vel.dot(normal)).toBeCloseTo(0, 10);
    expect(bodyA.vel.dot(normal.perpendicular())).toBeCloseTo(ex.vec(10, 5).dot(normal.perpendicular()), 10);
    expect(bodyB.vel.dot(normal)).toBeCloseTo(0, 10);
    expect(bodyB.vel.dot(normal.perpendicular())).toBeCloseTo(ex.vec(-4, -7).dot(normal.perpendicular()), 10);
    // the adjusted velocity is a new vector, the one read before is left alone
    expect(velA).toBeVector(ex.vec(10, 5));

    // both moving apart: nothing changes
    bodyA.vel = ex.vec(-10, -5);
    bodyB.vel = ex.vec(4, 7);
    arcadeSolver.solveVelocity(contactFor());
    expect(bodyA.vel).toBeVector(ex.vec(-10, -5));
    expect(bodyB.vel).toBeVector(ex.vec(4, 7));
  });

  it('splits the overlap between two active bodies and gives a fixed body none', () => {
    const arcadeSolver = new ex.ArcadeSolver(getDefaultPhysicsConfig().arcade);
    const active = new ex.Actor({ x: 0, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const other = new ex.Actor({ x: 36, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const contactFor = () =>
      new ex.CollisionContact(
        active.collider.get()!,
        other.collider.get()!,
        ex.vec(4, 0),
        ex.Vector.Right,
        ex.Vector.Right.perpendicular(),
        [],
        [],
        null as any
      );

    arcadeSolver.solvePosition(contactFor());
    expect(active.pos).toBeVector(ex.vec(-2, 0));
    expect(other.pos).toBeVector(ex.vec(38, 0));

    active.pos = ex.vec(0, 0);
    other.pos = ex.vec(36, 0);
    other.body.collisionType = ex.CollisionType.Fixed;
    arcadeSolver.solvePosition(contactFor());
    expect(active.pos).toBeVector(ex.vec(-4, 0));
    expect(other.pos).toBeVector(ex.vec(36, 0));
  });
});
