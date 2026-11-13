import { Vector } from '../math/vector';
import type { TransformComponent } from '../entity-component-system/components/transform-component';
import type { MotionComponent } from '../entity-component-system/components/motion-component';
import { clamp } from '../math';

export class EulerIntegrator {
  // Scratch vectors to avoid allocation
  private static _POS = new Vector(0, 0);
  private static _SCALE = new Vector(1, 1);

  static integrate(transform: TransformComponent, motion: MotionComponent, totalAcc: Vector, elapsed: number): void {
    const seconds = elapsed / 1000;
    // plain number math that reads each component once: integration runs for every moving entity every frame
    const accX = totalAcc.x;
    const accY = totalAcc.y;
    const vel = motion.vel;
    const maxVel = motion.maxVel;
    // clamp the components of the velocity vector
    const velX = clamp(vel.x + accX * seconds, -maxVel.x, maxVel.x);
    const velY = clamp(vel.y + accY * seconds, -maxVel.y, maxVel.y);
    vel.setTo(velX, velY);

    const halfSecondsSquared = 0.5 * seconds * seconds;
    const pos = transform.pos;
    EulerIntegrator._POS.setTo(pos.x + velX * seconds + accX * halfSecondsSquared, pos.y + velY * seconds + accY * halfSecondsSquared);

    motion.angularVelocity += motion.torque * (1.0 / motion.inertia) * seconds;
    const rotation = transform.rotation + motion.angularVelocity * seconds;

    const scale = transform.scale;
    const scaleFactor = motion.scaleFactor;
    EulerIntegrator._SCALE.setTo(scale.x + scaleFactor.x * seconds, scale.y + scaleFactor.y * seconds);
    const tx = transform.get();
    tx.setTransform(EulerIntegrator._POS, rotation, EulerIntegrator._SCALE);
  }
}
