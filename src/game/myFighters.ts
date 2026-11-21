/**
 * YOUR FIGHTERS — add one line per fighter.
 *
 *   id    the folder name: public/assets/<id>/   (english, lowercase, no spaces)
 *   name  the name shown in the game
 *   flip  true if your pictures face RIGHT (the game needs fighters facing LEFT)
 *
 * Pictures go in public/assets/<id>/ :
 *   idle  walk  punch  kick  hit  ko        (needed)
 *   jump  crouch  block  special  portrait  (bonus)
 *
 * Full rules: ADD_CHARACTER.md
 */
export interface MyFighter {
  id: string;
  name: string;
  flip?: boolean;
  /** Only if auto-detect counts the poses wrong: { kick: 4 } */
  frames?: Record<string, number>;
}

export const MY_FIGHTERS: MyFighter[] = [
  { id: 'blue-striker', name: 'Blue Striker' },
  { id: 'muay-thai', name: 'Muay Thai', flip: true },
  { id: 'taekwondo', name: 'Taekwondo', flip: true },
  { id: 'mongol-bokh', name: 'Mongol Bokh', flip: true }
];
