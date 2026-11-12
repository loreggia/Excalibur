import * as ex from '@excalibur';
import { getDefaultPhysicsConfig } from '../../engine/collision/physics-config';

describe('A RealisticSolver', () => {
  it('should exist', () => {
    expect(ex.RealisticSolver).toBeDefined();
  });

  it('should cancel zero overlap collisions during presolve', () => {
    const realisticSolver = new ex.RealisticSolver(getDefaultPhysicsConfig().realistic);

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

    realisticSolver.preSolve([contact]);
    // Considers infinitesimally overlapping to no longer be overlapping and thus cancels the contact
    expect(contact.isCanceled).toBe(true);
  });

  it('should run the configured number of position and velocity iterations without variable shadowing issues', () => {
    const config = { ...getDefaultPhysicsConfig().realistic, positionIterations: 3, velocityIterations: 4 };
    const realisticSolver = new ex.RealisticSolver(config);

    const actor1 = new ex.Actor({ x: 0, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const actor2 = new ex.Actor({ x: 30, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });

    const contact = actor1.collider.collide(actor2.collider);

    // Should not throw and should complete successfully with multiple iterations
    realisticSolver.preSolve(contact);
    realisticSolver.solvePosition(contact);
    realisticSolver.solveVelocity(contact);
    realisticSolver.postSolve(contact);
  });

  it('should drop stale constraint points when a contact manifold shrinks', () => {
    const realisticSolver = new ex.RealisticSolver(getDefaultPhysicsConfig().realistic);

    // Two boxes overlapping face-on produce a 2 point manifold
    const bottom = new ex.Actor({ x: 0, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    const top = new ex.Actor({ x: 0, y: -35, width: 40, height: 40, collisionType: ex.CollisionType.Active });

    const twoPoint = bottom.collider.collide(top.collider);
    expect(twoPoint.length).toBe(1);
    expect(twoPoint[0].points.length).toBe(2);

    realisticSolver.preSolve(twoPoint);
    expect(realisticSolver.getContactConstraints(twoPoint[0].id).length).toBe(2);

    // Same contact id next frame, but the manifold shrank to a single point
    const onePoint = bottom.collider.collide(top.collider);
    onePoint[0].points = [onePoint[0].points[0]];
    onePoint[0].localPoints = [onePoint[0].localPoints[0]];

    realisticSolver.preSolve(onePoint);
    const constraints = realisticSolver.getContactConstraints(onePoint[0].id);
    expect(constraints.length).toBe(1);
    // The surviving point must be bound to the live contact, not the previous frame's
    expect(constraints[0].contact).toBe(onePoint[0]);

    // And an empty manifold leaves nothing to solve
    const noPoint = bottom.collider.collide(top.collider);
    noPoint[0].points = [];
    noPoint[0].localPoints = [];
    realisticSolver.preSolve(noPoint);
    expect(realisticSolver.getContactConstraints(noPoint[0].id).length).toBe(0);
  });

  it('does not solve contacts that touch a sleeping body', () => {
    const realisticSolver = new ex.RealisticSolver(getDefaultPhysicsConfig().realistic);

    const floor = new ex.Actor({ x: 0, y: 20, width: 200, height: 40, collisionType: ex.CollisionType.Fixed });
    const box = new ex.Actor({ x: 0, y: -18, width: 40, height: 40, collisionType: ex.CollisionType.Active });
    box.body.canSleep = true;
    floor.collider.update();
    box.collider.update();

    const solveOnce = () => {
      const contacts = box.collider.collide(floor.collider);
      expect(contacts.length).toBe(1);
      realisticSolver.preSolve(contacts);
      realisticSolver.solveVelocity(contacts);
      realisticSolver.solvePosition(contacts);
      realisticSolver.postSolve(contacts);
    };

    box.body.sleep();
    solveOnce();
    // a sleeping body is never integrated, so it must not receive impulses or corrections either
    expect(box.pos.y).toBe(-18);
    expect(box.vel).toBeVector(ex.vec(0, 0));
    expect(box.body.angularVelocity).toBe(0);

    box.body.wake();
    solveOnce();
    // once awake the overlap is corrected as usual
    expect(box.pos.y).toBeLessThan(-18);
  });

  it('warm starts each body exactly as applyImpulseAtOffset would', () => {
    const config = { ...getDefaultPhysicsConfig().realistic, warmStart: true };
    const realisticSolver = new ex.RealisticSolver(config);
    const create = () => {
      const bottom = new ex.Actor({ x: 0, y: 0, width: 40, height: 40, collisionType: ex.CollisionType.Active });
      const top = new ex.Actor({ x: 6, y: -35, width: 40, height: 40, rotation: 0.05, collisionType: ex.CollisionType.Active });
      bottom.vel = ex.vec(3.25, -1.5);
      bottom.angularVelocity = 0.3;
      top.vel = ex.vec(-2.75, 9.5);
      top.angularVelocity = -0.7;
      bottom.collider.update();
      top.collider.update();
      return { bottom, top };
    };
    const solved = create();
    const expected = create();

    const contacts = solved.bottom.collider.collide(solved.top.collider);
    realisticSolver.preSolve(contacts);
    const contact = contacts[0];
    const points = realisticSolver.getContactConstraints(contact.id);
    expect(points.length).toBe(2);
    points.forEach((point, i) => {
      point.normalImpulse = 1.5 + i;
      point.tangentImpulse = -0.25 * (i + 1);
    });
    // preSolve does not move the bodies, so the twins still match
    expect(solved.bottom.vel).toBeVector(expected.bottom.vel);

    realisticSolver.warmStart(contacts);

    for (const point of points) {
      const impulseX = contact.normal.x * point.normalImpulse + contact.tangent.x * point.tangentImpulse;
      const impulseY = contact.normal.y * point.normalImpulse + contact.tangent.y * point.tangentImpulse;
      expected.bottom.body.applyImpulseAtOffset(point.aToContact.x, point.aToContact.y, -impulseX, -impulseY);
      expected.top.body.applyImpulseAtOffset(point.bToContact.x, point.bToContact.y, impulseX, impulseY);
    }
    for (const name of ['bottom', 'top'] as const) {
      expect(solved[name].vel.x).toBe(expected[name].vel.x);
      expect(solved[name].vel.y).toBe(expected[name].vel.y);
      expect(solved[name].angularVelocity).toBe(expected[name].angularVelocity);
    }
  });

  it('leaves a fixed body and the locked degrees of freedom of an active one untouched', () => {
    const realisticSolver = new ex.RealisticSolver(getDefaultPhysicsConfig().realistic);
    const floor = new ex.Actor({ x: 0, y: 20, width: 200, height: 40, collisionType: ex.CollisionType.Fixed });
    // a moving platform: fixed bodies can have a velocity of their own
    floor.vel = ex.vec(5, 0);
    const box = new ex.Actor({ x: 10, y: -18, width: 40, height: 40, rotation: 0.1, collisionType: ex.CollisionType.Active });
    box.body.limitDegreeOfFreedom.push(ex.DegreeOfFreedom.X, ex.DegreeOfFreedom.Rotation);
    box.vel = ex.vec(7, 30);
    box.angularVelocity = 0.5;
    floor.collider.update();
    box.collider.update();

    const contacts = box.collider.collide(floor.collider);
    expect(contacts.length).toBe(1);
    realisticSolver.preSolve(contacts);
    realisticSolver.solveVelocity(contacts);

    expect(floor.vel).toBeVector(ex.vec(5, 0));
    expect(floor.angularVelocity).toBe(0);
    expect(box.vel.x).toBe(7);
    expect(box.angularVelocity).toBe(0.5);
    // the free axis did take the impulse: the box no longer moves into the floor
    expect(box.vel.y).toBeLessThan(30);
  });
});
