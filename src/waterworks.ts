/**
 * The Waterworks: water and timing. On six holes the ball is always one slip from the water: a ball on water is lost, a
 * stroke is added and it is put back where it was struck from, so they ask how hard and how straight of a player who
 * cannot afford to be wrong. The other three, Traffic, Ferris and The Big Wheel, came from The Fair when it went on
 * 8 October 2026, and ask when: barriers, a windmill's door and a bumper to time. The Lock, The Island Green and Mill Pond
 * went then, a barrier as The Meadow's, an island green as The Flood's and a windmill over water as The Mill Race's. Each
 * hole has one idea and something on it to time, use or fear, as The Meadow's have. Content, not code: see `course.ts`
 * for how a map is drawn.
 *
 * What the autopilot will play decided the drawing, and the notes by each hole say where. It keeps a ball's width and
 * three tenths of a unit from the water either side of its line, so a strip a tile wide (three units) is one it will
 * cross only along its middle, and it will not stand a ball for a shot on a stone where less than a fifth of the shot
 * and two units of grass lie beyond. A ball struck at a middling speed also crosses a tile of water, which the physics
 * lets it (seen with a probe of one pond a tile wide, and not held by a test), so a gap is never the way a hole is held
 * shut. What moves stands on level ground, which the physics insists on, and a cup stands on level grass with a tile
 * of grass round it, so a ball can drop in from any side.
 */
import { BUMPER } from './arena';
import type { HoleDef } from './course';

export const WATERWORKS: readonly HoleDef[] = [
  {
    name: 'The Causeway',
    par: 2,
    // a strip over a pond, straight to the cup: nothing to decide but nerve. It is two tiles wide and not the sheet's three
    // (nine units, which a slip of ten degrees from the tee still crosses), with the tee a tile off its middle, so
    // the ball runs a tile and a half from the water on one side, and eight tiles long, so a slip of a few degrees
    // is a ball lost on that side
    map: [
      '##########',
      '#~~....~~#',
      '#~~..C.~~#',
      '#~~....~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#~~~..~~~#',
      '#........#',
      '#........#',
      '#....T...#',
      '#........#',
      '##########',
    ],
  },
  {
    name: 'The Stepping Stones',
    par: 3,
    // three stones, the two corners of a horseshoe of strips three tiles wide round a pond, and the cup's island: the way
    // from the tee to the cup is up, across and down, and a ball struck straight at the cup is lost. It must stop on
    // each stone, since past it is water, and be turned there. Not the sheet's stones of two tiles by two a tile of
    // water apart: a ball crosses a gap that narrow at speed, and the autopilot, which cannot, found no stone it could
    // stop on (one tile of strip between stones took it seven strokes, a step at a time). The stones are four tiles square
    map: [
      '##############',
      '#....~~~~....#',
      '#............#',
      '#............#',
      '#............#',
      '#~...~~~~~...#',
      '#~...~~~~~...#',
      '#.....~~~....#',
      '#..T..~~~..C.#',
      '#.....~~~....#',
      '##############',
    ],
  },
  {
    name: 'Traffic',
    par: 3,
    // far enough that no one stroke reaches the cup, so the first is struck through both barriers and waits for the one moment they are both clear
    map: [
      '###########',
      '#.........#',
      '#....C....#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '#.........#',
      '###########',
    ],
    obstacles: [
      { kind: 'barrier', at: [4, 12], length: 1.5, travel: 4.5, period: 4.5 },
      { kind: 'barrier', at: [5, 14], length: 1.5, travel: 4.5, period: 4.5, phase: 0.5 },
    ],
  },
  {
    name: 'The Spillway',
    par: 3,
    // a lane six tiles wide along a pond's edge, the ground tilted toward the water a step to every two tiles, with the
    // tee at the water's edge and the cup across the lane: every putt breaks toward the pond, and is aimed up the slope
    // of it by the arrows. The autopilot, which aims straight, was lost in the pond on every seed on a lane four tiles
    // wide or a tilt of a step a tile; at this width and tilt it takes two strokes
    map: [
      '###########',
      '#......~~~#',
      '#.C....~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#......~~~#',
      '#.....T~~~#',
      '#......~~~#',
      '###########',
    ],
    terrain: [
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
      '88776655443',
    ],
  },
  {
    name: 'Ferris',
    par: 3,
    // the wall is raised grass, a wall to the ball, and the one door in it is the windmill's; the kicker stands square behind the door, far enough back that a soft ball dies short of it, so a ball struck hard straight through is thrown back into the blades, and the cup is tucked to one side where only a second stroke, across the room, reaches it
    map: [
      '###########',
      '#.........#',
      '#....k....#',
      '#.........#',
      '#.C.......#',
      '#.........#',
      '#.........#',
      '#3333.3333#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '#.........#',
      '###########',
    ],
    obstacles: [{ kind: 'windmill', at: [5, 7], period: 6 }],
  },
  {
    name: 'The Weir',
    par: 3,
    // a river runs north down the lane's east side, five tiles wide, over the edge and into a pond beside the cup: the line
    // to the cup is down the west side, and a ball that strays onto the stream is carried to the pond and lost. A stream
    // takes the speed out of a ball that meets it (it pulls the ball's velocity toward its own), so nothing struck onto
    // one crosses it, however hard; it is a place to keep off
    map: [
      '###########',
      '#...~~~~~~#',
      '#.C.~~~~~~#',
      '#...~~~~~~#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.T.......#',
      '#.........#',
      '###########',
    ],
    obstacles: [
      { kind: 'conveyor', from: [4, 15], to: [4, 4], speed: 5, look: 'water' },
      { kind: 'conveyor', from: [5, 15], to: [5, 4], speed: 5, look: 'water' },
      { kind: 'conveyor', from: [6, 15], to: [6, 4], speed: 5, look: 'water' },
      { kind: 'conveyor', from: [7, 15], to: [7, 4], speed: 5, look: 'water' },
      { kind: 'conveyor', from: [8, 15], to: [8, 4], speed: 5, look: 'water' },
    ],
  },
  {
    name: 'The Rapids',
    par: 3,
    // a river in a pond: four streams in a zigzag, north, east, north, west and north, each two tiles wide, each handing
    // the ball to the next as it leaves the end of one, so that a ball struck onto the first is carried all the way
    // down to the cup's side, and a ball struck anywhere else is in the water. Nothing struck across a stream crosses
    // it, so the river is the only way, and the ball is aimed at its mouth. The belts run at nine units a second: at six the game
    // counts a ball riding one as at rest and the autopilot taps it again before it is out
    map: [
      '#############',
      '#.........~~#',
      '#..C......~~#',
      '#.........~~#',
      '#~..~~~~~~~~#',
      '#~..~~~~~~~~#',
      '#~..~~~~~~~~#',
      '#~..~~~~~~~~#',
      '#~........~~#',
      '#~........~~#',
      '#~~~~~~~..~~#',
      '#~~~~~~~..~~#',
      '#~~~~~~~..~~#',
      '#~........~~#',
      '#~........~~#',
      '#~..~~~~~~~~#',
      '#~..~~~~~~~~#',
      '#~..~~~~~~~~#',
      '#.....~~~~~~#',
      '#.....~~~~~~#',
      '#..T..~~~~~~#',
      '#.....~~~~~~#',
      '#############',
    ],
    obstacles: [
      { kind: 'conveyor', from: [2, 17], to: [2, 15], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [3, 17], to: [3, 15], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [2, 13], to: [7, 13], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [2, 14], to: [7, 14], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [8, 14], to: [8, 10], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [9, 14], to: [9, 10], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [9, 8], to: [4, 8], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [9, 9], to: [4, 9], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [2, 9], to: [2, 4], speed: 9, look: 'water' },
      { kind: 'conveyor', from: [3, 9], to: [3, 4], speed: 9, look: 'water' },
    ],
  },
  {
    name: 'The Big Wheel',
    par: 4,
    // the finale, as The Mill Race has three things: two barriers crossing, a moving bumper, a windmill's door in a wall, and a belt that carries the ball to the cup
    map: [
      '###########',
      '#.........#',
      '#....C....#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#####.#####',
      '#.........#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '###########',
    ],
    obstacles: [
      // the barriers are listed first, since a barrier's box is the pusher of its own number only while no windmill comes before it
      { kind: 'barrier', at: [5, 26], length: 1.5, travel: 4.5, period: 4, phase: 0.25, bounce: BUMPER.restitution },
      { kind: 'barrier', at: [5, 32], length: 1.5, travel: 4.5, period: 5 },
      { kind: 'barrier', at: [5, 31], length: 1.5, travel: 4.5, period: 5, phase: 0.5 },
      { kind: 'windmill', at: [5, 37], period: 8, phase: 0.125 },
      { kind: 'conveyor', from: [5, 4], to: [5, 3], speed: 5 },
    ],
  },
  {
    name: 'The Flood',
    par: 4,
    // the finale, long and straight up one line: a lock's gate in a channel from the tee, a stone to stand on, a stream
    // carrying north over the pond to a neck, and the island green in its bowl. The stream is the one way over,
    // since nothing crosses a pond of that width and a stream takes the ball's speed. The ground is level but for the
    // island, since the scene draws a belt at the height of the grass and would bury it on a hill: the island is a bowl of
    // two steps, ringed by a rim of three, and a ball rolls up to it from the neck by a step of two
    map: [
      '#############',
      '#~~~~~~~~~~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~...C...~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~.......~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~.....~~~#',
      '#~~~.....~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~.....~~~#',
      '#~~~~~.~~~~~#',
      '#~~~~~.~~~~~#',
      '#~~~.....~~~#',
      '#~~~..T..~~~#',
      '#############',
    ],
    terrain: [
      '0000000000000',
      '0000000000000',
      '0003222223000',
      '0003211123000',
      '0003210123000',
      '0003211123000',
      '0003222223000',
      '0002222222000',
      '0002222222000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
    ],
    obstacles: [
      { kind: 'barrier', at: [6, 18], length: 1, travel: 3.7, period: 4 },
      { kind: 'conveyor', from: [6, 13], to: [6, 9], speed: 5, look: 'water' },
    ],
  },
];
