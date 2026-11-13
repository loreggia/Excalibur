import type { Entity, Query, World } from '../entity-component-system';
import { SystemPriority } from '../entity-component-system';
import { MotionComponent } from '../entity-component-system/components/motion-component';
import { PauseComponentTag } from '../entity-component-system/components/pause-component';
import { TransformComponent } from '../entity-component-system/components/transform-component';
import { System, SystemType } from '../entity-component-system/system';
import { BodyComponent } from './body-component';
import { CollisionType } from './collision-type';
import { EulerIntegrator } from './integrator';
import type { PhysicsWorld } from './physics-world';
import { Vector } from '../math/vector';

export class MotionSystem extends System {
  static override priority = SystemPriority.Higher;

  public systemType = SystemType.Update;
  private _physicsConfigDirty = false;
  /** Scratch for an entity's total acceleration, the integrator does not keep it */
  private _totalAcc = new Vector(0, 0);
  query: Query<typeof TransformComponent | typeof MotionComponent>;

  private _createPhysicsQuery(world: World, physics: PhysicsWorld) {
    return world.query({
      components: {
        all: [TransformComponent, MotionComponent]
      },
      tags: {
        not: physics.config.integration.onScreenOnly
          ? ['ex.offscreen', 'ex.is_sleeping', PauseComponentTag]
          : ['ex.is_sleeping', PauseComponentTag]
      }
    });
  }

  constructor(
    public world: World,
    public physics: PhysicsWorld
  ) {
    super();
    this.query = this._createPhysicsQuery(world, physics);
    physics.$configUpdate.subscribe(() => {
      this._physicsConfigDirty = true;
    });
  }

  onUpdate(elapsed: number): void {
    let transform: TransformComponent;
    let motion: MotionComponent;
    const entities = this.query.entities;
    const config = this.physics.config;
    const stepElapsed = elapsed / config.substep;
    // read once: the config is a proxy, and so is its gravity
    const gravityX = config.gravity.x;
    const gravityY = config.gravity.y;
    const totalAcc = this._totalAcc;

    for (let i = 0; i < entities.length; i++) {
      transform = entities[i].get(TransformComponent);
      motion = entities[i].get(MotionComponent);

      if (motion.integration.onScreenOnly && entities[i].hasTag('ex.offscreen')) {
        continue;
      }

      const optionalBody = entities[i].get(BodyComponent);
      if (this._physicsConfigDirty && optionalBody) {
        optionalBody.updatePhysicsConfig(config.bodies);
      }

      if (optionalBody?.isSleeping) {
        continue;
      }

      totalAcc.setTo(motion.acc.x, motion.acc.y);
      if (optionalBody?.collisionType === CollisionType.Active && optionalBody?.useGravity) {
        totalAcc.x += gravityX;
        totalAcc.y += gravityY;
      }

      // capture old transform of this entity and all of its children so that
      // any transform properties that derived from their parents are properly captured
      if (!entities[i].parent) {
        this.captureOldTransformWithChildren(entities[i]);
      }

      // Update transform and motion based on Euler linear algebra
      EulerIntegrator.integrate(transform, motion, totalAcc, stepElapsed);
    }
    if (this._physicsConfigDirty) {
      this._physicsConfigDirty = false;
      this.query = this._createPhysicsQuery(this.world, this.physics);
    }
  }

  captureOldTransformWithChildren(entity: Entity) {
    entity.get(BodyComponent)?.captureOldTransform();

    for (let i = 0; i < entity.children.length; i++) {
      this.captureOldTransformWithChildren(entity.children[i]);
    }
  }
}
