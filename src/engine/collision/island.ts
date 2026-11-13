import type { BodyConfig } from './index';
import { CollisionType, type BodyComponent, type CollisionContact } from './index';

export class Island {
  bodies: BodyComponent[] = [];
  contacts: CollisionContact[] = [];
  isSleeping = false;
  /**
   * @param config
   * @param build The {@apilink buildContactIslands} call that made this island
   */
  constructor(
    public config: BodyConfig,
    public readonly build = -1
  ) {}
  wake() {
    this.isSleeping = false;
    for (const body of this.bodies) {
      body.wake();
    }
  }

  sleep() {
    this.isSleeping = true;
    for (const body of this.bodies) {
      body.sleep();
    }
  }

  updateSleepState(elapsed: number) {
    let islandHasMotion = false;
    let allBodiesCanSleep = true;
    let anyAwake = false;
    let anySleeping = false;

    for (const body of this.bodies) {
      body.updateMotion(elapsed);

      if (!body.canFallAsleep) {
        allBodiesCanSleep &&= false;
      }
      if (body.canWakeUp) {
        islandHasMotion ||= true;
      }
      if (body.isSleeping) {
        anySleeping = true;
      } else {
        anyAwake = true;
      }
    }

    // Wake entire island if ANY body has motion, or if the island is only partially asleep.
    // Bodies in an island share a sleep state, mixed islands would let awake bodies push into
    // sleeping (never integrated) bodies
    if (islandHasMotion || (anyAwake && anySleeping)) {
      this.wake();

      // Put entire island to sleep if ALL bodies are below threshold
    } else if (allBodiesCanSleep) {
      let minSleepTime = Infinity;
      for (const body of this.bodies) {
        minSleepTime = Math.min(minSleepTime, body.sleepTime);
      }

      // Only sleep if the ENTIRE island has been still long enough
      if (minSleepTime > this!.config!.sleepTimeThreshold) {
        this.sleep();
      }
    }
  }
}

let islandBuild = 0;

/**
 * Union-find root of the body in the given build, a body the build has not touched yet is its own root
 */
function findRoot(body: BodyComponent, build: number): BodyComponent {
  if (body.__islandBuild !== build) {
    body.__islandBuild = build;
    body.__islandParent = body;
    return body;
  }
  let root = body;
  while (root.__islandParent !== root) {
    root = root.__islandParent!;
  }
  // path compression
  while (body !== root) {
    const next = body.__islandParent!;
    body.__islandParent = root;
    body = next;
  }
  return root;
}

export function buildContactIslands(config: BodyConfig, bodies: BodyComponent[], contacts: CollisionContact[]): Island[] {
  const build = ++islandBuild;

  // Connect active bodies through contacts
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    if (contact.bodyA?.collisionType === CollisionType.Active && contact.bodyB?.collisionType === CollisionType.Active) {
      const rootA = findRoot(contact.bodyA, build);
      const rootB = findRoot(contact.bodyB, build);
      if (rootA !== rootB) {
        rootA.__islandParent = rootB;
      }
    }
  }

  // Group active bodies by island, a root's island is the one made in this build
  const islands: Island[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body.collisionType !== CollisionType.Active) {
      continue;
    }
    const root = findRoot(body, build);
    let island = root.island;
    if (!island || island.build !== build) {
      island = new Island(config, build);
      islands.push(island);
      root.island = island;
    }
    island.bodies.push(body);
    body.island = island;
  }

  // A contact belongs to the island of its active body, both are in the same one when both are active
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const body =
      contact.bodyA?.collisionType === CollisionType.Active
        ? contact.bodyA
        : contact.bodyB?.collisionType === CollisionType.Active
          ? contact.bodyB
          : null;
    if (body?.island?.build === build) {
      body.island.contacts.push(contact);
    }
  }

  return islands;
}
