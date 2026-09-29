// Third-person chase camera: sits low behind the tank (below wall height, so nobody sees over walls),
// swings round smoothly when the tank turns, and slides in closer instead of going through a wall.
import { rayToWall, pushOutOfWalls, WALL_H } from './world.js';

// Height and distance come from the player's settings (defaults 3.0 m up, 7.5 m back); the height is
// always capped under the wall tops, so nobody can see over walls whatever the setting says.
const LOOK_AHEAD = 8;    // aim this far in front of the tank
const LOOK_H = 1.5;
const SWING = 5;         // how fast the camera catches up with a turn
const MIN_BACK = 1.5;

export function makeChaseCamera(camera) {
  let yaw = null, BACK = 7.5, HEIGHT = 3.0, back = BACK;

  function follow(tank, dt) {
    const p = tank.position, target = tank.rotation.y;
    if (yaw === null) yaw = target;
    let diff = target - yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // shortest way round
    yaw += diff * Math.min(1, SWING * dt);

    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // how far back can we go before a wall? pull in instantly, ease back out slowly
    const room = rayToWall(p.x, p.z, p.x - fx * BACK, p.z - fz * BACK) - 0.6;
    const want = Math.max(MIN_BACK, Math.min(BACK, room));
    back = want < back ? want : back + (want - back) * Math.min(1, 3 * dt);

    const cam = { x: p.x - fx * back, z: p.z - fz * back };
    pushOutOfWalls(cam, 0.45);   // keep the lens off side walls in tight alleys
    // when squeezed in, rise a little (still under the wall tops) so the turret doesn't fill the screen
    const squeeze = 1 - (back - MIN_BACK) / (BACK - MIN_BACK);
    camera.position.set(cam.x, Math.min(HEIGHT + squeeze * 1.1, WALL_H - 0.4), cam.z);
    camera.lookAt(p.x + fx * LOOK_AHEAD, LOOK_H, p.z + fz * LOOK_AHEAD);
  }
  follow.set = (height, distance) => { HEIGHT = Math.min(height, WALL_H - 0.4); BACK = Math.max(MIN_BACK + 0.5, distance); };
  follow.yaw = () => yaw;   // which way the camera faces (same angle convention as the tank)
  return follow;
}
