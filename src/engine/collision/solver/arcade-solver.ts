import { PostCollisionEvent, PreCollisionEvent } from '../../events';
import type { CollisionContact } from '../detection/collision-contact';
import { CollisionType } from '../collision-type';
import { Side } from '../side';
import type { CollisionSolver } from './solver';
import { BodyComponent } from '../body-component';
import { BoundingBox } from '../bounding-box';
import type { ContactBias } from './contact-bias';
import { ContactSolveBias, HorizontalFirst, None, VerticalFirst } from './contact-bias';
import type { PhysicsConfig } from '../physics-config';
import type { DeepRequired } from '../../util/required';
import { Vector } from '../../math/vector';

/**
 * ArcadeSolver is the default in Excalibur. It solves collisions so that there is no overlap between contacts,
 * and negates velocity along the collision normal.
 *
 * This is usually the type of collisions used for 2D games that don't need a more realistic collision simulation.
 *
 */
export class ArcadeSolver implements CollisionSolver {
  directionMap = new Map<string, 'horizontal' | 'vertical'>();
  distanceMap = new Map<string, number>();
  private _boundsA = new BoundingBox();
  private _boundsB = new BoundingBox();

  constructor(public config: DeepRequired<Pick<PhysicsConfig, 'arcade'>['arcade']>) {}

  public solve(contacts: CollisionContact[]): CollisionContact[] {
    // Events and init
    this.preSolve(contacts);

    // Remove any canceled contacts
    contacts = contacts.filter((c) => !c.isCanceled);

    // Locate collision bias order
    let bias: ContactBias;
    switch (this.config!.contactSolveBias) {
      case ContactSolveBias.HorizontalFirst: {
        bias = HorizontalFirst;
        break;
      }
      case ContactSolveBias.VerticalFirst: {
        bias = VerticalFirst;
        break;
      }
      default: {
        bias = None;
      }
    }

    // Sort by bias (None, VerticalFirst, HorizontalFirst) to avoid artifacts with seams
    // Sort contacts by distance to avoid artifacts with seams
    // It's important to solve in a specific order
    contacts.sort((a, b) => {
      const aDir = this.directionMap.get(a.id)!;
      const bDir = this.directionMap.get(b.id)!;
      const aDist = this.distanceMap.get(a.id)!;
      const bDist = this.distanceMap.get(b.id)!;
      return bias[aDir] - bias[bDir] || aDist - bDist;
    });

    for (const contact of contacts) {
      // Solve position first in arcade
      this.solvePosition(contact);

      // Solve velocity second in arcade
      this.solveVelocity(contact);
    }

    // Events and any contact house-keeping the solver needs
    this.postSolve(contacts);

    return contacts;
  }

  private _compositeContactsIds = new Set<string>();
  public preSolve(contacts: CollisionContact[]) {
    const epsilon = 0.0001;
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Cancel dup composite together strategy contacts
      const index = contact.id.indexOf('|');
      if (index > 0) {
        const compositeId = contact.id.substring(index + 1);
        if (this._compositeContactsIds.has(compositeId)) {
          contact.cancel();
          continue;
        }
        this._compositeContactsIds.add(compositeId);
      }

      // Cancel near 0 mtv collisions
      if (Math.abs(contact.mtv.x) < epsilon && Math.abs(contact.mtv.y) < epsilon) {
        contact.cancel();
        continue;
      }

      // Record distance/direction for sorting
      const side = Side.fromDirection(contact.mtv);
      const mtv = contact.mtv.negate();

      const distance = Math.abs(contact.info.separation);
      this.distanceMap.set(contact.id, distance);

      this.directionMap.set(contact.id, side === Side.Left || side === Side.Right ? 'horizontal' : 'vertical');

      // Publish collision events on both participants
      contact.colliderA.events.emit('precollision', new PreCollisionEvent(contact.colliderA, contact.colliderB, side, mtv, contact));
      contact.colliderB.events.emit(
        'precollision',
        new PreCollisionEvent(contact.colliderB, contact.colliderA, Side.getOpposite(side), mtv.negate(), contact)
      );
    }
    this._compositeContactsIds.clear();
  }

  public postSolve(contacts: CollisionContact[]) {
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      if (contact.isCanceled) {
        continue;
      }
      const colliderA = contact.colliderA;
      const colliderB = contact.colliderB;
      const bodyA = colliderA.owner?.get(BodyComponent);
      const bodyB = colliderB.owner?.get(BodyComponent);
      if (bodyA && bodyB) {
        if (bodyA.collisionType === CollisionType.Passive || bodyB.collisionType === CollisionType.Passive) {
          continue;
        }
      }

      const side = Side.fromDirection(contact.mtv);
      const mtv = contact.mtv.negate();
      // Publish collision events on both participants
      contact.colliderA.events.emit('postcollision', new PostCollisionEvent(contact.colliderA, contact.colliderB, side, mtv, contact));
      contact.colliderB.events.emit(
        'postcollision',
        new PostCollisionEvent(contact.colliderB, contact.colliderA, Side.getOpposite(side), mtv.negate(), contact)
      );
    }
  }

  public solvePosition(contact: CollisionContact) {
    const epsilon = 0.0001;
    // if bounds no longer intersect skip to the next
    // this removes jitter from overlapping/stacked solid tiles or a wall of solid tiles
    if (!contact.colliderA.getBounds(this._boundsA).overlaps(contact.colliderB.getBounds(this._boundsB), epsilon)) {
      // Cancel the contact to prevent and solving
      contact.cancel();
      return;
    }

    if (Math.abs(contact.mtv.x) < epsilon && Math.abs(contact.mtv.y) < epsilon) {
      // Cancel near 0 mtv collisions
      contact.cancel();
      return;
    }

    const mtv = contact.mtv;
    const colliderA = contact.colliderA;
    const colliderB = contact.colliderB;
    const bodyA = colliderA.owner?.get(BodyComponent);
    const bodyB = colliderB.owner?.get(BodyComponent);
    if (bodyA && bodyB) {
      if (bodyA.collisionType === CollisionType.Passive || bodyB.collisionType === CollisionType.Passive) {
        return;
      }

      // split overlaps if both are Active
      const split = bodyA.collisionType === CollisionType.Active && bodyB.collisionType === CollisionType.Active ? 0.5 : 1;
      const mtvX = mtv.x * split;
      const mtvY = mtv.y * split;

      // Resolve overlaps
      if (bodyA.collisionType === CollisionType.Active) {
        bodyA.globalPos.x -= mtvX;
        bodyA.globalPos.y -= mtvY;
        colliderA.update(bodyA.transform.get());
      }

      if (bodyB.collisionType === CollisionType.Active) {
        bodyB.globalPos.x += mtvX;
        bodyB.globalPos.y += mtvY;
        colliderB.update(bodyB.transform.get());
      }
    }
  }

  public solveVelocity(contact: CollisionContact) {
    if (contact.isCanceled) {
      return;
    }

    const colliderA = contact.colliderA;
    const colliderB = contact.colliderB;
    const bodyA = colliderA.owner?.get(BodyComponent);
    const bodyB = colliderB.owner?.get(BodyComponent);

    if (bodyA && bodyB) {
      if (bodyA.collisionType === CollisionType.Passive || bodyB.collisionType === CollisionType.Passive) {
        return;
      }

      // a body moving into the contact loses the part of its velocity along the normal: v - n * (n . v)
      const nX = contact.normal.x;
      const nY = contact.normal.y;

      if (bodyA.collisionType === CollisionType.Active) {
        // only adjust velocity if the contact normal is opposite to the current velocity
        // this avoids catching edges on a platform when sliding off
        const vel = bodyA.vel;
        const velDotNormal = vel.x * nX + vel.y * nY;
        if (velDotNormal > 0) {
          // Cancel out velocity opposite direction of collision normal
          bodyA.vel = new Vector(vel.x - nX * velDotNormal, vel.y - nY * velDotNormal);
        }
      }

      if (bodyB.collisionType === CollisionType.Active) {
        // only adjust velocity if the contact normal is opposite to the current velocity
        // this avoids catching edges on a platform
        const vel = bodyB.vel;
        const velDotNormal = vel.x * nX + vel.y * nY;
        if (velDotNormal < 0) {
          bodyB.vel = new Vector(vel.x - nX * velDotNormal, vel.y - nY * velDotNormal);
        }
      }
    }
  }
}
