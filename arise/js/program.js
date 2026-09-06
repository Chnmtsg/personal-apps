/* Discipline — the built-in dumbbell training program.

   Kept out of data.js because this is a *program* (a specific 6-day split with
   its own prescriptions and coaching notes), not the app's generic seed data.
   Everything here is plain data: no DOM, no storage.

   Two shapes:
     PROGRAM_EXERCISES — the library, each with a `how` (newline-separated cues)
     PROGRAM_WEEK      — the weekly template, referring to exercises by name

   Warm-ups and stretches are ONE item per day rather than one per movement.
   A day is "complete" only when every item on it is ticked, so listing seven
   separate arm-circle rows would make finishing a day a chore and drown the
   lifts that actually matter. The full sequence lives in that item's `how`,
   so nothing is lost. */
(function (root) {
  'use strict';

  const A = (root.Arise = root.Arise || {});

  /* ---------- warm-ups ---------- */

  const WARMUPS = [
    {
      name: 'Warm-up — Push',
      muscles: ['chest','front_delts','side_delts'],
      category: 'Warm-up', unit: 'time', minutes: 8, icon: '',
      how: [
        'Run straight through, no rest. About 8 minutes.',
        '1. Jumping jacks — 60 s',
        '2. Arm circles — 15 each way',
        '3. Band pull-apart, or arm swings — 20',
        '4. Scapular push-ups — 12',
        '5. Push-up plus — 10',
        '6. Push-ups — 10',
        '7. Light dumbbell press — 15 at about 40%',
        '8. Working weight — 50% × 8',
        'This is blood flow and rehearsal, not training.'
      ].join('\n')
    },
    {
      name: 'Warm-up — Pull',
      muscles: ['lats','rear_delts','biceps'],
      category: 'Warm-up', unit: 'time', minutes: 8, icon: '',
      how: [
        'Run straight through, no rest. About 8 minutes.',
        '1. March on the spot — 2 min',
        '2. Cat-cow — 10',
        '3. Arm circles — 15 each way',
        '4. Band pull-apart — 20',
        '5. Scapular retraction — 15',
        '6. Light dumbbell row — 15 per side',
        '7. Light curl — 15'
      ].join('\n')
    },
    {
      name: 'Warm-up — Legs A',
      muscles: ['quads','glutes','hamstrings'],
      category: 'Warm-up', unit: 'time', minutes: 9, icon: '',
      how: [
        'The squat-day warm-up. About 9 minutes, no rest between.',
        '1. March on the spot — 2 min',
        '2. Bodyweight squats — 15',
        '3. Leg swings — 12 per leg, both directions',
        '4. Hip circles — 15 each way',
        '5. Glute bridge — 20',
        '6. Side-lying hip abduction — 15 per side',
        '7. Walking lunge — 8 per leg',
        '8. Light goblet squat — 10',
        'The abduction and the bridge are the ones to not skip: twelve hours in a',
        'seat leaves the glutes underused, and this is where you wake them up.'
      ].join('\n')
    },
    {
      name: 'Warm-up — Legs B',
      muscles: ['hamstrings','glutes','lower_back'],
      category: 'Warm-up', unit: 'time', minutes: 9, icon: '',
      how: [
        'The hinge-day warm-up. About 9 minutes, no rest between.',
        '1. March on the spot — 2 min',
        '2. Glute bridge — 20',
        '3. Side-lying hip abduction — 15 per side',
        '4. Bird dog — 10 per side',
        '5. Leg swings — 12 per leg, both directions',
        '6. Reverse lunge — 8 per leg',
        '7. Bodyweight good morning — 12'
      ].join('\n')
    },
    {
      name: 'Warm-up — Push (gym)',
      muscles: ['chest','front_delts','side_delts'],
      category: 'Warm-up', unit: 'time', minutes: 10, icon: '',
      how: [
        'About 10 minutes. The last three entries are the barbell ramp.',
        '1. Bike or rower — 4 min',
        '2. Arm circles — 15 each way',
        '3. Band pull-apart — 20',
        '4. Band external rotation — 15 per side',
        '5. Scapular push-ups — 12',
        '6. Banded wall slide — 10',
        '7. Empty bar bench — 12',
        '8. 50% × 8',
        '9. 70% × 4',
        'Ramp every session. Do not walk up to a working set cold.'
      ].join('\n')
    },
    {
      name: 'Warm-up — Pull (gym)',
      muscles: ['lats','rear_delts','biceps'],
      category: 'Warm-up', unit: 'time', minutes: 10, icon: '',
      how: [
        'About 10 minutes.',
        '1. Rower — 4 min',
        '2. Cat-cow — 10',
        '3. Band pull-apart — 20',
        '4. Dead hang — 2 × 15 s',
        '5. Light face pull — 15',
        '6. Light pulldown — 15'
      ].join('\n')
    },
    {
      name: 'Warm-up — Legs A (gym)',
      muscles: ['quads','glutes','hamstrings'],
      category: 'Warm-up', unit: 'time', minutes: 11, icon: '',
      how: [
        'The squat-day warm-up. About 11 minutes, ending in the bar ramp.',
        '1. Bike — 4 min',
        '2. Bodyweight squats — 15',
        '3. Leg swings — 12 per leg',
        '4. Hip circles — 15',
        '5. Glute bridge — 20',
        '6. Banded lateral walk — 15 steps each way',
        '7. Walking lunge — 8 per leg',
        '8. Empty bar squat — 10',
        '9. 40% × 8',
        '10. 60% × 5'
      ].join('\n')
    },
    {
      name: 'Warm-up — Legs B (gym)',
      muscles: ['hamstrings','glutes','lower_back'],
      category: 'Warm-up', unit: 'time', minutes: 11, icon: '',
      how: [
        'The deadlift-day warm-up. About 11 minutes, ending in the bar ramp.',
        '1. Bike — 4 min',
        '2. Glute bridge — 20',
        '3. Banded lateral walk — 15 steps each way',
        '4. Bird dog — 10 per side',
        '5. Leg swings — 12 per leg',
        '6. Reverse lunge — 8 per leg',
        '7. Empty bar good morning — 12',
        '8. Deadlift 40% × 8',
        '9. 60% × 5'
      ].join('\n')
    }
  ];

  /* ---------- chest / shoulders / triceps ---------- */

  const PUSH = [
    {
      name: 'Dumbbell Floor Press',
      muscles: ['chest','front_delts','triceps'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 8, repsMax: 12, icon: '🏋️',
      how: [
        'Lie on the floor, knees bent, a dumbbell in each hand at chest level.',
        'Press straight up until the arms lock out over the chest.',
        'Lower under control until the upper arms rest lightly on the floor.',
        'Pause for a beat on the floor — no bouncing the elbows.',
        'The floor limits the range and protects the shoulder; that is the point.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Squeeze Press',
      muscles: ['chest','front_delts','triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '🏋️',
      how: [
        'Same position as the floor press, but press the two dumbbells hard together.',
        'Keep squeezing them into each other for the whole set.',
        'Press up and lower slowly, maintaining the inward pressure.',
        'Lighter weight than the floor press — the tension comes from the squeeze.',
        'You should feel this in the middle of the chest.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Shoulder Press',
      muscles: ['front_delts','side_delts','triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '🏋️',
      how: [
        'Sit or stand tall, dumbbells at shoulder height, palms facing forward.',
        'Press overhead until the arms are straight, without shrugging.',
        'Lower under control back to ear level.',
        'Keep the ribs down — do not arch the lower back to finish a rep.',
        'Brace the abs as if about to be poked in the stomach.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Lateral Raise',
      muscles: ['side_delts'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 12, repsMax: 15, icon: '🏋️',
      how: [
        'Stand with light dumbbells at your sides, a slight bend in the elbows.',
        'Raise the arms out to the sides until level with the shoulders.',
        'Lead with the elbows, not the hands.',
        'Lower slowly — three seconds down beats swinging it up.',
        'Go light. Ego costs you the side delt entirely on this one.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Fly',
      muscles: ['chest','front_delts'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '🏋️',
      how: [
        'Lie on the floor or a bench, dumbbells above the chest, palms facing each other.',
        'Open the arms wide in an arc with a fixed slight elbow bend.',
        'Stop when the upper arms reach floor level, then hug back up the same arc.',
        'Think of wrapping your arms around a barrel.',
        'This is a stretch movement — lighter than any press.'
      ].join('\n')
    },
    {
      name: 'Arnold Press',
      muscles: ['front_delts','side_delts','triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '🏋️',
      how: [
        'Start with dumbbells at chest height, palms facing you.',
        'As you press up, rotate the palms to face forward.',
        'Finish locked out overhead, palms forward.',
        'Reverse the rotation exactly on the way down.',
        'The rotation brings the front delt in — keep it smooth, not rushed.'
      ].join('\n')
    },
    {
      name: 'Overhead Dumbbell Triceps Extension',
      muscles: ['triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '💪',
      how: [
        'Hold one dumbbell with both hands, arms straight overhead.',
        'Lower it behind the head by bending only at the elbows.',
        'Keep the upper arms still and close to the head.',
        'Extend back up until the arms are straight.',
        'Stop lowering when you feel a strong stretch — no elbow pain.'
      ].join('\n')
    },
    {
      name: 'Single-Arm Overhead Triceps Extension',
      muscles: ['triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '💪',
      how: [
        'One dumbbell, one arm straight overhead.',
        'Lower behind the head, elbow pointing at the ceiling.',
        'The free hand can support the working elbow.',
        'Press back to lockout, then repeat all reps before switching sides.',
        'Working one side at a time exposes and fixes strength differences.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Skull Crusher',
      muscles: ['triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '💪',
      how: [
        'Lie on the floor, dumbbells pressed straight above the chest, palms facing.',
        'Bend the elbows to lower the weights beside your ears.',
        'Keep the upper arms vertical and completely still.',
        'Extend back to straight arms using the triceps only.',
        'Control it — the name is a warning, not a joke.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Kickback',
      muscles: ['triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 12, repsMax: 15, icon: '💪',
      how: [
        'Hinge forward at the hips, back flat, upper arms tucked against your sides.',
        'Straighten the elbows to drive the dumbbells back behind you.',
        'Squeeze the triceps hard at full extension.',
        'Return slowly to 90 degrees without letting the upper arm drop.',
        'Light weight; the whole lift happens below the elbow.'
      ].join('\n')
    }
  ];

  /* ---------- back / biceps / rear delts ---------- */

  const PULL = [
    {
      name: 'One-Arm Dumbbell Row',
      muscles: ['lats','rear_delts','biceps'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 8, repsMax: 12, icon: '🏋️',
      how: [
        'Brace one hand and knee on a bench or chair, back flat and parallel to the floor.',
        'Let the dumbbell hang at arm’s length, then row it to the hip.',
        'Drive the elbow back past the ribs; do not flare it out.',
        'Lower all the way down to feel the lat stretch.',
        'Keep the shoulders square — resist twisting to move more weight.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Bent-Over Row',
      muscles: ['lats','traps','rear_delts','biceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '🏋️',
      how: [
        'Hinge at the hips until the torso is about 45 degrees, knees soft, back flat.',
        'Row both dumbbells to the lower ribs, elbows close to the body.',
        'Squeeze the shoulder blades together at the top.',
        'Lower under control to a full stretch.',
        'If the lower back rounds, lighten the weight immediately.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Pullover',
      muscles: ['lats','chest'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '🏋️',
      how: [
        'Lie on the floor or across a bench, one dumbbell held over the chest with both hands.',
        'Keeping the arms nearly straight, lower the weight back over the head.',
        'Go until you feel a deep stretch through the lats and ribcage.',
        'Pull it back over the chest along the same arc.',
        'Move only at the shoulder — the elbows stay locked in place.'
      ].join('\n')
    },
    {
      name: 'Rear Delt Fly',
      muscles: ['rear_delts','traps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 12, repsMax: 15, icon: '🏋️',
      how: [
        'Hinge forward, chest down, light dumbbells hanging beneath you.',
        'Raise the arms out to the sides in a wide arc, elbows slightly bent.',
        'Lead with the elbows and stop at shoulder height.',
        'Squeeze the rear shoulders, then lower slowly.',
        'Very light weight. If you can swing it, it is too heavy.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Shrug',
      muscles: ['traps','forearms'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '🏋️',
      how: [
        'Stand tall, a dumbbell in each hand at your sides, arms straight.',
        'Lift the shoulders straight up toward the ears.',
        'Hold the top for a full second.',
        'Lower slowly and completely.',
        'Do not roll the shoulders — straight up and straight down.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Curl',
      muscles: ['biceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '💪',
      how: [
        'Stand tall, dumbbells at your sides, palms facing forward.',
        'Curl both up to shoulder height without moving the elbows.',
        'Squeeze the biceps at the top.',
        'Lower all the way to straight arms, slowly.',
        'No swinging the hips — the back stays still.'
      ].join('\n')
    },
    {
      name: 'Alternating Dumbbell Curl',
      muscles: ['biceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '💪',
      how: [
        'Same as the dumbbell curl, but one arm at a time.',
        'Curl the right, lower it fully, then curl the left.',
        'The resting arm stays straight and still.',
        'Alternating lets you concentrate on each side.',
        'Count reps per arm, not in total.'
      ].join('\n')
    },
    {
      name: 'Hammer Curl',
      muscles: ['biceps','forearms'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '💪',
      how: [
        'Hold the dumbbells with palms facing each other, like holding two hammers.',
        'Curl up keeping that neutral grip the whole way.',
        'Elbows stay pinned to your sides.',
        'Lower slowly to straight arms.',
        'This hits the brachialis and forearm — the part that adds arm thickness.'
      ].join('\n')
    },
    {
      name: 'Cross-Body Hammer Curl',
      muscles: ['biceps','forearms'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '💪',
      how: [
        'Neutral grip, as in a hammer curl.',
        'Curl the dumbbell diagonally across the body toward the opposite shoulder.',
        'Keep the upper arm still; only the forearm travels.',
        'Lower under control and alternate sides.',
        'The cross-body path puts the brachialis under a longer pull.'
      ].join('\n')
    }
  ];

  /* ---------- legs ---------- */

  const LEGS = [
    {
      name: 'Goblet Squat',
      muscles: ['quads','glutes'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 8, repsMax: 12, icon: '🦵',
      how: [
        'Hold one dumbbell vertically against your chest with both hands.',
        'Feet shoulder-width, toes turned slightly out.',
        'Sit down between your hips, chest tall, until the thighs are at least parallel.',
        'Drive through the whole foot to stand back up.',
        'The weight at your chest is a counterbalance — it helps you sit deeper.'
      ].join('\n')
    },
    {
      name: 'Bulgarian Split Squat',
      muscles: ['quads','glutes','hamstrings'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '🦵',
      how: [
        'Stand a stride in front of a bench or chair; rest the top of the rear foot on it.',
        'Hold a dumbbell in each hand at your sides.',
        'Lower straight down until the front thigh is parallel to the floor.',
        'Drive up through the front heel. Finish all reps, then swap legs.',
        'Keep the torso upright and the front shin close to vertical.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Romanian Deadlift',
      muscles: ['hamstrings','glutes','lower_back'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 8, repsMax: 12, icon: '🏋️',
      how: [
        'Stand tall, dumbbells in front of the thighs, knees slightly bent.',
        'Push the hips backwards and let the weights travel down the legs.',
        'Keep the back flat and the dumbbells in contact with your legs.',
        'Stop when you feel a strong hamstring stretch, then drive the hips forward.',
        'This is a hip hinge, not a squat — the knees barely move.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Lunges',
      muscles: ['quads','glutes','hamstrings'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, icon: '🚶',
      how: [
        'Dumbbells at your sides, stand tall.',
        'Step forward and lower until both knees are at about 90 degrees.',
        'The back knee should hover just above the floor.',
        'Push back through the front heel to the start.',
        'Alternate legs; count 10 per leg.'
      ].join('\n')
    },
    {
      name: 'Standing Calf Raise',
      muscles: ['calves'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 12, repsMax: 20, icon: '🦵',
      how: [
        'Stand tall holding dumbbells, balls of the feet on a step if you have one.',
        'Rise as high onto the toes as you can.',
        'Hold the top for a full second — the squeeze is the exercise.',
        'Lower slowly until you feel a stretch in the calf.',
        'No bouncing. Slow up, pause, slow down.'
      ].join('\n')
    },
    {
      name: 'Single-Leg Calf Raise',
      muscles: ['calves'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 12, repsMax: 20, icon: '🦵',
      how: [
        'Stand on one foot, holding one dumbbell on that same side.',
        'Steady yourself against a wall with the free hand.',
        'Rise onto the toes as high as possible and pause at the top.',
        'Lower slowly to a full stretch. Finish the set, then swap legs.',
        'One leg at a time doubles the load without heavier weight.'
      ].join('\n')
    }
  ];

  /* ---------- core ---------- */

  const CORE = [
    {
      name: 'Reverse Crunch',
      muscles: ['abs'],
      category: 'Core', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '🔥',
      how: [
        'Lie on your back, hands by your sides or under the hips, knees bent.',
        'Curl the knees up and in, lifting the hips off the floor.',
        'The movement is the pelvis tilting toward the ribs, not the legs swinging.',
        'Lower slowly without letting the feet touch down.',
        'Small range done properly beats a big range with momentum.'
      ].join('\n')
    },
    {
      name: 'Lying Leg Raise',
      muscles: ['abs'],
      category: 'Core', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '🔥',
      how: [
        'Lie flat, legs straight, hands under the lower back or hips.',
        'Keep the lower back pressed into the floor throughout.',
        'Raise the legs to vertical, then lower them slowly.',
        'Stop lowering the moment the back starts to arch.',
        'Bend the knees slightly if the hamstrings are tight.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Russian Twist',
      muscles: ['obliques','abs'],
      category: 'Core', unit: 'reps', sets: 3, reps: 12, repsMax: 20, icon: '🌀',
      how: [
        'Sit with the knees bent, heels down, leaning back to about 45 degrees.',
        'Hold one dumbbell with both hands at chest height.',
        'Rotate the torso to tap the weight beside one hip, then the other.',
        'Turn from the ribcage — do not just swing the arms.',
        'Count one rep per side.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Side Bend',
      muscles: ['obliques'],
      category: 'Core', unit: 'reps', sets: 3, reps: 12, repsMax: 15, icon: '🌀',
      how: [
        'Stand tall with one dumbbell in one hand, the other hand behind your head.',
        'Bend sideways toward the loaded side, letting the weight slide down the leg.',
        'Return by pulling with the opposite side of the waist.',
        'Stay in one plane — no leaning forward or twisting.',
        'Finish all reps, then swap sides.'
      ].join('\n')
    }
  ];

  /* ---------- stretches & recovery ---------- */

  const STRETCH = [
    {
      name: 'Stretch — Push Day',
      muscles: ['chest','front_delts','triceps'],
      category: 'Stretch', unit: 'time', minutes: 6, icon: '',
      how: [
        'After training, never before. Hold 30–45 s, breathe, never bounce.',
        'Mild tension — a 4 to 6 out of 10. Pain means you are at the joint.',
        '1. Doorway chest stretch, elbow at shoulder height — 30 s × 2',
        '   Step through until you feel the pec, not the shoulder joint.',
        '2. Cross-body shoulder — 30 s per side',
        '   Keep the shoulder pressed down, not shrugged.',
        '3. Overhead triceps — 30 s per side',
        '   Hand down the spine, press the elbow gently back.',
        '4. Child’s pose, arms extended — 45 s',
        '5. Thoracic extension over a chair back — 10 reps',
        '   Reps, not a hold.'
      ].join('\n')
    },
    {
      name: 'Stretch — Pull Day',
      muscles: ['lats','biceps','forearms'],
      category: 'Stretch', unit: 'time', minutes: 6, icon: '',
      how: [
        'After training, never before. Hold 30–45 s, breathe, never bounce.',
        '1. Lat stretch on a doorframe or bar — 30 s per side',
        '   Sit the hips back and away. Feel it along the ribs, not the shoulder.',
        '2. Thread-the-needle — 30 s per side',
        '   Thoracic rotation.',
        '3. Biceps wall stretch — 30 s per side',
        '   Palm on the wall behind you, rotate the chest away.',
        '4. Upper-back rounding — 30 s',
        '5. Forearm flexor and extensor — 25 s each, per side'
      ].join('\n')
    },
    {
      name: 'Stretch — Leg Day',
      muscles: ['quads','hamstrings','glutes','calves','adductors'],
      category: 'Stretch', unit: 'time', minutes: 7, icon: '',
      how: [
        'After training, never before. Hold 30–45 s, breathe, never bounce.',
        '1. Quad stretch, standing — 30 s per leg',
        '   Knees together, hips pushed slightly forward.',
        '2. Hamstring stretch — 30 s per leg',
        '   Hinge from the hip with a FLAT back. Rounding stretches the back.',
        '3. Couch stretch / kneeling hip flexor — 45 s per leg',
        '   SQUEEZE THE GLUTE on the kneeling side. Without that you are just',
        '   leaning forward and stretching nothing. The most important one for you.',
        '4. Calf stretch, straight knee — 30 s per leg (gastrocnemius)',
        '5. Calf stretch, bent knee — 30 s per leg (soleus)',
        '   You need both. The soleus is the half most people never stretch.',
        '6. Figure-4 glute — 30 s per leg',
        '7. Butterfly adductor — 45 s. Do not press the knees down.'
      ].join('\n')
    },
    {
      name: 'Full-Body Stretch',
      muscles: ['full'],
      category: 'Stretch', unit: 'time', minutes: 12, icon: '🧘',
      how: [
        'An easy 10–15 minutes covering everything you trained this week.',
        'Chest, shoulders and triceps — 30 sec each.',
        'Lats, upper back and biceps — 30 sec each.',
        'Quads, hamstrings, hip flexors, calves and glutes — 30 sec per leg.',
        'Breathe out as you settle deeper into each position.'
      ].join('\n')
    },
    {
      name: 'Recovery Walk',
      muscles: ['calves','cardio'],
      category: 'Cardio', unit: 'time', minutes: 30, icon: '🚶',
      how: [
        'Easy pace, 20–40 minutes. You should be able to hold a conversation.',
        'Outdoors if you can — daylight helps the sleep you are chasing.',
        'This is circulation and recovery, not a workout.',
        'Easy basketball or shooting hoops counts.',
        'If you finish out of breath, you went too hard.'
      ].join('\n')
    },
    {
      name: 'Light Mobility',
      muscles: ['full'],
      category: 'Mobility', unit: 'time', minutes: 10, icon: '🤸',
      how: [
        'Gentle, unloaded movement through full ranges. About 10 minutes.',
        'Cat-cow — 10 slow reps.',
        'Hip circles and leg swings — 10 per side.',
        'Arm circles and shoulder rolls — 15 each.',
        'Thoracic rotations — 10 per side.',
        'Nothing here should feel like effort.'
      ].join('\n')
    }
  ];

  /* ---------- Context 1: SITE (dumbbells only) ----------

     The four-session pattern this app now programmes. Everything above stays in
     the library — nothing is deleted, because a removed exercise orphans plan
     items and the library is the user's own reference list — but the week below
     is built from these.

     Warm-ups and stretches are ONE item per session, as everywhere else in this
     file: a day is complete only when every item is ticked, so seven separate
     arm-circle rows would make finishing a day a chore and drown the lifts that
     actually matter. The full sequence lives in the item's `how`.

     The RIR calibration note rides each warm-up because it governs the session
     rather than any one lift, and the warm-up is the first thing you open. */

  const RIR_NOTE =
    'RIR, for the first two rotations: research is consistent that novices ' +
    'underestimate how close to failure they are — you will call something 2 RIR ' +
    'when it is really 5. On the ISOLATION exercises only, take one set per ' +
    'exercise genuinely to failure so you learn what the top actually feels like. ' +
    'Then calibrate everything else against it.';

  const SITE = [
    {
      name: 'Reverse Nordic',
      muscles: ['quads'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 8, icon: '',
      how: [
        'Kneel upright, knees hip-width, feet behind you. Squeeze the glutes.',
        'Lean backwards slowly, keeping a straight line from knee to shoulder.',
        'Go only as far as you can control, then pull yourself back up.',
        'This trains the rectus femoris, which crosses the hip as well as the',
        'knee — a squat does not fully cover it.',
        'Start with a very small range. This one produces real soreness.'
      ].join('\n')
    },
    {
      name: 'Tibialis Raise',
      muscles: ['calves'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 15, repsMax: 20, icon: '',
      how: [
        'Stand with your back against a wall, heels 20–30 cm out from it.',
        'Keeping the heels down, pull the toes up towards the shins.',
        'Lower slowly. Add a tib bar or a light plate over the toes when it is easy.',
        'The tibialis anterior decelerates the foot on landing and protects the',
        'ankle. Almost nobody trains it.'
      ].join('\n')
    },
    {
      name: 'Wrist Curl',
      muscles: ['forearms'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 15, icon: '',
      how: [
        'Forearms resting on your thighs or a bench, wrists past the edge.',
        'Palms up: let the weight roll to the fingers, then curl it back up.',
        'Palms down: lift the back of the hand towards you. Do both directions.',
        'A wrist roller does the same job if you have one.',
        'Grip feeds the deadlift, which is the lift currently lagging.'
      ].join('\n')
    },
    {
      name: 'Side-Lying Dumbbell External Rotation',
      muscles: ['rear_delts'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 15, icon: '🛡️',
      how: [
        'Lie on your side, upper arm against your ribs, elbow bent 90 degrees.',
        'Rotate the forearm up toward the ceiling, keeping the elbow pinned.',
        'Lower slowly to the start.',
        'Light. This is joint insurance, not a lift — 4 RIR is the point of it.',
        'The rotator cuff is what lets you keep pressing for years.'
      ].join('\n')
    },
    {
      name: 'Dead Bug',
      muscles: ['abs'],
      category: 'Core', unit: 'reps', sets: 2, reps: 10, icon: '🪲',
      how: [
        'On your back, arms straight up, hips and knees bent to 90 degrees.',
        'Lower the opposite arm and leg toward the floor, slowly.',
        'Return and change sides. That is one rep per side.',
        'The low back stays flat on the floor throughout — that is the whole exercise.',
        'If the back lifts, shorten the range rather than pushing through it.'
      ].join('\n')
    },
    {
      name: 'Copenhagen Plank',
      muscles: ['adductors','obliques','abs'],
      category: 'Core', unit: 'time', minutes: 1, icon: '🧱',
      how: [
        'Side plank position, top leg resting on a bench.',
        'Short lever: the KNEE on the bench, not the ankle. Start there.',
        'Lift the hips until the body is a straight line, and hold.',
        'Adductor work — the groin muscles a squat and a lunge never load directly.',
        'Move to the ankle on the bench only when 20 s a side is easy.'
      ].join('\n')
    },
    {
      name: 'Dumbbell Reverse Lunge',
      muscles: ['quads','glutes','hamstrings'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, icon: '🚶',
      how: [
        'Dumbbells at your sides, stand tall.',
        'Step BACK, not forward, and lower until both knees are near 90 degrees.',
        'Push through the front heel to return to standing.',
        'Stepping back rather than forward is easier on the knee — that is why this',
        'is the lunge in the programme and the forward version is not.'
      ].join('\n')
    },
    {
      name: 'Hamstring Slider Curl',
      muscles: ['hamstrings','glutes'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 6, repsMax: 10, icon: '🦵',
      how: [
        'On your back, heels on sliders, a towel or socks on a smooth floor.',
        'Bridge the hips up, then slide the heels away until the legs are almost straight.',
        'Pull them back in under control. The hips stay up the whole time.',
        'No sliders: a Nordic negative instead — kneel, anchor the feet, and lower',
        'the torso forward as slowly as you can, catching yourself with your hands.',
        'Eccentric hamstring work. Progress slowly — this one causes real soreness.'
      ].join('\n')
    },
    {
      name: 'Side Plank',
      muscles: ['obliques','abs'],
      category: 'Core', unit: 'time', minutes: 1, icon: '🧘',
      how: [
        'On your side, forearm under the shoulder, feet stacked.',
        'Lift the hips until head, hips and heels are in one line.',
        'Do not let the top shoulder roll forward or the hips sag.',
        'Breathe normally. Hold for time, then change sides.'
      ].join('\n')
    },

    {
      name: 'Daily Shift Mobility',
      muscles: ['quads','glutes','chest','full'],
      category: 'Mobility', unit: 'time', minutes: 6, icon: '🪑',
      how: [
        'Every working day, training or not. Do it AFTER your shift.',
        '1. Couch stretch, or kneeling hip flexor — 60 s per side',
        '2. Glute bridge — 20 reps',
        '3. Thoracic extension over a chair back — 10 reps',
        '4. Doorway chest stretch — 30 s × 2',
        '5. Neck side stretch — 20 s per side',
        '',
        'Twelve hours in an operator’s seat holds the hip flexors short and leaves',
        'the glutes underused. This is the highest-value six minutes in the whole',
        'programme, and it is the one thing here that does not care whether you',
        'trained today.'
      ].join('\n')
    }
  ];

  /* ---------- Context 2: HOME (full gym) ----------

     No longer drafted. The athlete supplied the full home programme in
     2026-09 — six sessions, every exercise named — so what was an assumption
     about barbells and a rack is now the document. The exercises below are what
     it asks for.

     The substitution map the programme gives, site to home, is the reason the
     two contexts are interchangeable: floor press becomes bench, goblet squat
     becomes back squat, pullover becomes a pulldown or a pull-up, and the
     volume per muscle is matched across both. Two weeks on either side of a
     rotation trains the same things with different tools. ---- */
  const GYM = [
    {
      name: 'Farmer Carry',
      muscles: ['forearms','traps','abs','obliques'],
      category: 'Strength', unit: 'time', minutes: 2, icon: '',
      how: [
        'A dumbbell in each hand, heavy enough that the last few seconds are hard.',
        'Stand tall — ribs down, shoulders back and DOWN, not shrugged.',
        'Walk at a normal pace, or stand still if there is no room.',
        'Breathe. Holding your breath is the most common mistake here.',
        'Grip and upper back, which nothing else in this programme trains directly.',
        'Put them down before your form goes, not after.'
      ].join('\n')
    },
    {
      name: 'Barbell Back Squat',
      muscles: ['quads','glutes','hamstrings','lower_back'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 5, repsMax: 8, icon: '',
      how: [
        'Bar on the upper back, not the neck. Hands as narrow as the shoulders allow.',
        'Brace as if about to be punched, then break at the hips and knees together.',
        'Down until the hip crease passes the knee, if you can do it without the',
        'lower back rounding. Depth first, load second — always.',
        'Drive the floor away. The bar path stays over the middle of the foot.',
        'In a rack, with the pins set. Never without them.'
      ].join('\n')
    },
    {
      name: 'Barbell Deadlift',
      muscles: ['hamstrings','glutes','lower_back','traps','forearms'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 3, repsMax: 5, icon: '',
      how: [
        'Bar over the middle of the foot. Shins come to the bar, not the bar to the shins.',
        'Take the slack out before you pull — the bar should click into the plates.',
        'Chest up, back flat, then push the floor away and stand.',
        'The set ends when the back rounds. Not when the reps run out.',
        'Heaviest thing in the programme, and the one worth the fewest reps.'
      ].join('\n')
    },
    {
      name: 'Barbell Bench Press',
      muscles: ['chest','front_delts','triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 5, repsMax: 8, icon: '',
      how: [
        'Shoulder blades pulled back and down and KEPT there for the whole set.',
        'Bar to the lower chest, elbows about 45 degrees from the body — not flared.',
        'Feet flat, no bouncing off the ribs.',
        'Use the safety pins or a spotter. This is the one lift that can pin you.',
        'If neither is available, press dumbbells off the floor instead.'
      ].join('\n')
    },
    {
      name: 'Barbell Overhead Press',
      muscles: ['front_delts','side_delts','triceps','abs'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 5, repsMax: 8, icon: '',
      how: [
        'Bar on the front of the shoulders, elbows just in front of it.',
        'Squeeze the glutes and abs so the lower back cannot arch to help.',
        'Move the head back out of the way, press, then finish with the bar over',
        'the middle of the foot and the head back through.',
        'The hardest honest test of whether you braced.'
      ].join('\n')
    },
    {
      name: 'Barbell Row',
      muscles: ['lats','traps','rear_delts','biceps','lower_back'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '',
      how: [
        'Hinge to about 45 degrees and hold it. The torso does not rise to move the bar.',
        'Pull to the bottom of the ribs, elbows past the body.',
        'Lower under control for two seconds.',
        'Stop the set the moment the back rounds or the torso starts swinging.'
      ].join('\n')
    },
    {
      name: 'Pull-up',
      muscles: ['lats','biceps','forearms','abs'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 4, repsMax: 10, icon: '',
      how: [
        'Hang from a bar, hands a little wider than the shoulders.',
        'Pull the elbows down and back until the chin clears the bar.',
        'Lower all the way — a half rep down is half a rep.',
        'Cannot do one yet: hang for time, then lower yourself slowly from the top.',
        'Negatives build the strength; there is no shortcut worth taking here.'
      ].join('\n')
    },
    {
      name: 'Barbell Curl',
      muscles: ['biceps','forearms'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '',
      how: [
        'Elbows pinned to the sides and STILL. If they travel forward, it is a swing.',
        'Curl to just short of vertical, then lower for two seconds.',
        'Lighter than your ego suggests. This one is easy to cheat and pointless cheated.'
      ].join('\n')
    }
,
    {
      name: 'Barbell Romanian Deadlift',
      muscles: ['hamstrings','glutes','lower_back','forearms'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '',
      how: [
        'Bar at the hips, standing tall, a slight bend in the knees.',
        'Push the hips backwards and let the bar travel down the thighs.',
        'Stop when the hamstring stretch stops increasing — usually mid-shin.',
        'Drive the hips forward to stand. The back stays flat throughout.',
        'Straps are fine here. The hamstrings should fail, not the grip.'
      ].join('\n')
    },
    {
      name: 'Incline Dumbbell Press',
      muscles: ['upper_chest','chest','front_delts','triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Bench at about 30 degrees. Steeper turns it into a shoulder press.',
        'Dumbbells at the outside of the chest, elbows about 45 degrees from the body.',
        'Press up and slightly together. Lower under control to a full stretch.',
        'This is the upper-chest exposure the flat press does not give you.'
      ].join('\n')
    },
    {
      name: 'Cable Fly',
      muscles: ['chest','upper_chest','front_delts'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 12, repsMax: 15, icon: '',
      how: [
        'Cables set at chest height or above, a soft bend in the elbows held fixed.',
        'Bring the hands together in front of the chest, then let them travel back',
        'until you feel a full stretch across the chest.',
        'The stretch at the outside is the part that matters. Do not cut it short.',
        'A pec deck does the same job.'
      ].join('\n')
    },
    {
      name: 'Close-Grip Bench Press',
      muscles: ['triceps','chest','front_delts'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 8, repsMax: 12, icon: '',
      how: [
        'Hands about shoulder-width — not narrower, which only hurts the wrists.',
        'Elbows tucked closer to the body than on a normal bench.',
        'Lower to the lower chest, press back up.',
        'The heaviest triceps work you can do, and it feeds the bench directly.',
        'A dip is the alternative if the shoulder is happy with it.'
      ].join('\n')
    },
    {
      name: 'Cable Lateral Raise',
      muscles: ['side_delts'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 12, repsMax: 20, icon: '',
      how: [
        'Cable at the lowest setting, running behind you, handle in the far hand.',
        'Raise out to the side, leading with the elbow, to shoulder height.',
        'Lower slowly against the pull.',
        'Better than the dumbbell version because there is tension at the bottom,',
        'where a dumbbell has none.'
      ].join('\n')
    },
    {
      name: 'Rope Triceps Pushdown',
      muscles: ['triceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '',
      how: [
        'Rope on a high pulley, elbows pinned to your sides.',
        'Push down and spread the rope apart at the bottom.',
        'Let it return until you feel the triceps stretch, without the elbows drifting.'
      ].join('\n')
    },
    {
      name: 'Overhead Cable Extension',
      muscles: ['triceps'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 12, repsMax: 15, icon: '',
      how: [
        'Face away from a low or mid pulley, rope overhead, elbows beside the ears.',
        'Extend to straight, then let the hands travel down behind the head.',
        'The long head of the triceps only gets loaded with the arm overhead —',
        'this is the version a pushdown cannot replace.'
      ].join('\n')
    },
    {
      name: 'Cable Face Pull',
      muscles: ['rear_delts','traps'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 15, icon: '',
      how: [
        'Rope at about face height. Pull towards your forehead, not your chest.',
        'Finish with the hands beside the ears and the elbows high.',
        'Light. This is rotator cuff and scapular work, not a back exercise.'
      ].join('\n')
    },
    {
      name: 'Lat Pulldown',
      muscles: ['lats','biceps','rear_delts'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Grip slightly wider than the shoulders, chest up, a small lean back.',
        'Drive the ELBOWS down towards the hips, not the hands towards the chin.',
        'Let the shoulder blades travel up at the top for a full stretch.',
        'The vertical pull is the one thing dumbbells cannot replicate.'
      ].join('\n')
    },
    {
      name: 'Chest-Supported Row',
      muscles: ['lats','traps','rear_delts','biceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Chest against an incline bench or the pad of a machine.',
        'Row to the lower ribs, pause 1 s with the shoulder blades pulled together.',
        'Because the bench holds you, the lower back cannot cheat and the set',
        'ends when the back muscles are finished rather than when you start swinging.'
      ].join('\n')
    },
    {
      name: 'Seated Cable Row',
      muscles: ['lats','traps','rear_delts','biceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Sit tall, a small forward lean at the front of the rep.',
        'Pull to the navel, elbows past the ribs.',
        'Let the shoulder blades travel forward at the front — that stretch is',
        'half of the exercise. Do not hold the torso rigid.'
      ].join('\n')
    },
    {
      name: 'Straight-Arm Pulldown',
      muscles: ['lats'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 12, repsMax: 15, icon: '',
      how: [
        'High pulley, arms straight with a fixed soft bend, a hinge at the hips.',
        'Pull the bar to the thighs in an arc, keeping the elbows locked.',
        'The one exercise that loads the lats without the biceps taking a share.'
      ].join('\n')
    },
    {
      name: 'Incline Dumbbell Curl',
      muscles: ['biceps'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Bench at 45–60 degrees, arms hanging straight down behind the body.',
        'Curl without letting the elbows travel forward.',
        'The arm behind the torso puts the biceps in a stretched position, which',
        'is where it grows. Lighter than a standing curl, and it should be.'
      ].join('\n')
    },
    {
      name: 'Cable Curl',
      muscles: ['biceps','forearms'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 12, repsMax: 15, icon: '',
      how: [
        'Low pulley, elbows at your sides and staying there.',
        'Curl up, lower slowly against the cable.',
        'Constant tension top to bottom, which a dumbbell loses at the top.'
      ].join('\n')
    },
    {
      name: 'Leg Press',
      muscles: ['quads','glutes','hamstrings'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Feet mid-platform, shoulder-width. Lower until the knees reach the chest',
        'without the lower back rounding off the pad.',
        'Press back without locking the knees hard at the top.',
        'Quad volume that costs the spine nothing, which is the point of it here.'
      ].join('\n')
    },
    {
      name: 'Lying Leg Curl',
      muscles: ['hamstrings','calves'],
      category: 'Strength', unit: 'reps', sets: 3, reps: 10, repsMax: 12, icon: '',
      how: [
        'Pad just above the heels, hips pressed into the bench.',
        'Curl the heels to the glutes, then lower over a full 3 seconds.',
        'The hamstrings bend the knee as well as extend the hip; a Romanian',
        'deadlift only trains the second job.'
      ].join('\n')
    },
    {
      name: 'Leg Extension',
      muscles: ['quads'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 12, repsMax: 15, icon: '',
      how: [
        'Pad on the lower shin, back against the seat.',
        'Extend to straight, pause briefly, lower under control.',
        'Trains the rectus femoris, which a squat does not fully cover.'
      ].join('\n')
    },
    {
      name: 'Seated Calf Raise',
      muscles: ['calves'],
      category: 'Strength', unit: 'reps', sets: 4, reps: 12, repsMax: 20, icon: '',
      how: [
        'Knees bent under the pad, balls of the feet on the platform.',
        'Drop the heels for a full stretch, pause 2 s there, then press up tall.',
        'The bent knee takes the gastrocnemius out and leaves the SOLEUS working —',
        'the half of the calf nearly everyone skips.'
      ].join('\n')
    },
    {
      name: 'Cable Hip Abduction',
      muscles: ['glutes'],
      category: 'Strength', unit: 'reps', sets: 2, reps: 15, icon: '',
      how: [
        'Cuff on the outside ankle, low pulley, standing tall and holding something.',
        'Take the leg out to the side without leaning away from it.',
        'Gluteus medius. Weakness here shows up as the knee caving in on landing.'
      ].join('\n')
    },
    {
      name: 'Cable Pallof Press',
      muscles: ['abs','obliques'],
      category: 'Core', unit: 'reps', sets: 2, reps: 10, icon: '',
      how: [
        'Stand side-on to a cable at chest height, hands at the sternum.',
        'Press straight out and hold while the cable tries to rotate you.',
        'Return, repeat. The work is in NOT turning.',
        'Anti-rotation. Better trunk training than any number of crunches.'
      ].join('\n')
    },
    {
      name: 'Hanging Leg Raise',
      muscles: ['abs','obliques'],
      category: 'Core', unit: 'reps', sets: 3, reps: 10, repsMax: 15, icon: '',
      how: [
        'Hang from a bar, shoulders active rather than fully relaxed.',
        'Raise the legs with the pelvis tucking under at the top — that tuck is',
        'what makes it abdominal work rather than hip flexor work.',
        'Lower slowly and do not swing. Bend the knees if straight legs pull you into a swing.'
      ].join('\n')
    }
  ];

  const PROGRAM_EXERCISES = WARMUPS.concat(PUSH, PULL, LEGS, CORE, STRETCH, SITE, GYM);

  /* ---------- the week, per context ----------

     Push / Pull / Legs, twice over, in both contexts. The programme was rewritten
     in 2026-09 around the athlete's actual lift numbers: a 1.67x bodyweight squat
     against a 0.92x bench, which is upper body trailing legs badly. So chest,
     back, side delts and arms sit at the top of the volume range and quads and
     hamstrings sit in the middle — enough to regain what was already held, which
     retraining makes cheap, without widening the gap that is already there.

     The app stores ONE weekly plan, so contexts are two templates and installing
     one replaces the plan.

     WHAT THIS CANNOT EXPRESS, AND YOU SHOULD KNOW IT. The site block is written
     as a ROLLING cycle — push, pull, legs, rest, repeat — and says in as many
     words "do not use a fixed weekly calendar on site". A four-day cycle does not
     tile a seven-day week: it drifts, which is the whole point of it. This app
     stores a plan per WEEKDAY, so it cannot hold a rolling cycle at all.

     What is laid down below is the closest weekly expression: the six sessions in
     order with Thursday as the rest day. It gives one rest day rather than two
     per eight, and it runs Friday through Wednesday without a break where the
     rolling version would stop. On camp food and camp sleep that is the exact
     failure the rolling cycle exists to prevent, so on site, MOVE THE DAYS BY
     HAND in Plan as the cycle drifts, or take an unscheduled rest day when you
     need it — a day with nothing scheduled keeps the streak.

     The home block is a fixed six-day week in the source, so it lands exactly.

     `reps`/`repsMax` and `minutes` override the exercise defaults per day, so
     Pull B can ask for a different rep range than Pull A on the same lift.

     `note` carries the PRESCRIPTION — reps per side, the RIR target, the rest
     interval, and any tempo the day asks for. The durable technique lives in the
     exercise's own `how`. A cue is true every time you do the lift; an RIR target
     is true on this day of this programme.

     THE REST INTERVAL IN THE NOTE IS READ BY THE APP. `A.restFromNote` parses
     "rest 90 s" and "rest 2–3 min" out of these strings to run the timer between
     sets, so the wording matters: keep the number immediately after the word
     "rest". A range counts down to its lower bound. See js/data.js.

     Daily Shift Mobility is on all seven days of both contexts, including the
     rest days, because the programme says so in as many words: "Training day or
     not." It is six minutes against twelve hours in an operator's seat, and the
     source calls it the highest-value six minutes in the document. */

  const SITE_WEEK = {
    1: {
      title: 'Push A — chest emphasis',
      items: [
        { name: 'Warm-up — Push' },
        { name: 'Dumbbell Floor Press', sets: 4, reps: 6, repsMax: 10, note: '2 RIR · rest 2–3 min · pause 1 s on the floor' },
        { name: 'Dumbbell Shoulder Press', sets: 3, reps: 8, repsMax: 12, note: 'seated, upright · 2 RIR · rest 2–3 min' },
        { name: 'Dumbbell Squeeze Press', sets: 3, reps: 12, repsMax: 15, note: '1 RIR · rest 90 s · squeeze the bells together throughout' },
        { name: 'Dumbbell Lateral Raise', sets: 3, reps: 12, repsMax: 20, note: '1 RIR · rest 75 s · lead with the elbow' },
        { name: 'Overhead Dumbbell Triceps Extension', sets: 3, reps: 10, repsMax: 12, note: '1–2 RIR · rest 90 s · full stretch at the bottom' },
        { name: 'Dumbbell Skull Crusher', sets: 2, reps: 10, repsMax: 12, note: '1 RIR · rest 90 s' },
        { name: 'Side-Lying Dumbbell External Rotation', sets: 2, reps: 15, note: 'per side · 4 RIR · rest 45 s · light, joint insurance' },
        { name: 'Stretch — Push Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    2: {
      title: 'Pull A — vertical and lat emphasis',
      items: [
        { name: 'Warm-up — Pull' },
        { name: 'Dumbbell Pullover', sets: 4, reps: 10, repsMax: 12, note: '2 RIR · rest 2 min · slow into the stretch' },
        { name: 'One-Arm Dumbbell Row', sets: 4, reps: 8, repsMax: 12, note: 'per side · 2 RIR · rest 90 s · 2 s lowering' },
        { name: 'Dumbbell Bent-Over Row', sets: 3, reps: 10, repsMax: 12, note: 'torso ~45° · 2 RIR · rest 2 min' },
        { name: 'Rear Delt Fly', sets: 3, reps: 15, repsMax: 20, note: 'thumbs down · 1 RIR · rest 60 s' },
        { name: 'Dumbbell Curl', sets: 3, reps: 8, repsMax: 12, note: '1–2 RIR · rest 90 s · 2 s lowering, no swing' },
        { name: 'Hammer Curl', sets: 3, reps: 10, repsMax: 12, note: '1–2 RIR · rest 60 s' },
        { name: 'Dumbbell Shrug', sets: 2, reps: 12, repsMax: 15, note: '1 RIR · rest 60 s · 1 s pause, no rolling' },
        { name: 'Stretch — Pull Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    3: {
      title: 'Legs A — squat emphasis',
      items: [
        { name: 'Warm-up — Legs A' },
        { name: 'Goblet Squat', sets: 4, reps: 8, repsMax: 12, note: '3 s lowering · 2 RIR · rest 2–3 min · depth first, load second' },
        { name: 'Dumbbell Romanian Deadlift', sets: 3, reps: 8, repsMax: 12, note: '2–3 RIR · rest 2–3 min' },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 10, repsMax: 12, note: 'per leg · 2 RIR · rest 90 s · front shin near vertical' },
        { name: 'Reverse Nordic', sets: 2, reps: 8, note: '3 RIR · rest 60 s · small range at first' },
        { name: 'Single-Leg Calf Raise', sets: 4, reps: 12, repsMax: 20, note: 'per leg · 0–1 RIR · rest 60 s · 2 s pause at the stretch' },
        { name: 'Tibialis Raise', sets: 2, reps: 15, repsMax: 20, note: '1 RIR · rest 45 s' },
        { name: 'Dead Bug', sets: 2, reps: 10, note: 'per side · rest 45 s · low back flat throughout' },
        { name: 'Copenhagen Plank', minutes: 1, note: '2 × 20 s per side, knee on the bench · rest 45 s' },
        { name: 'Stretch — Leg Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    4: { title: 'Rest', items: [{ name: 'Daily Shift Mobility' }] },
    5: {
      title: 'Push B — shoulder emphasis',
      items: [
        { name: 'Warm-up — Push' },
        { name: 'Dumbbell Shoulder Press', sets: 4, reps: 6, repsMax: 10, note: 'heaviest pressing of the cycle · 2 RIR · rest 2–3 min' },
        { name: 'Dumbbell Floor Press', sets: 3, reps: 8, repsMax: 12, note: '2 RIR · rest 2–3 min' },
        { name: 'Arnold Press', sets: 3, reps: 10, repsMax: 12, note: '1–2 RIR · rest 90 s · rotate palms in to out' },
        { name: 'Dumbbell Lateral Raise', sets: 4, reps: 12, repsMax: 20, note: 'highest side-delt volume of the week · 1 RIR · rest 75 s' },
        { name: 'Rear Delt Fly', sets: 3, reps: 15, repsMax: 20, note: 'thumbs down, strict · 1 RIR · rest 60 s' },
        { name: 'Single-Arm Overhead Triceps Extension', sets: 3, reps: 12, repsMax: 15, note: '1–2 RIR · rest 60 s' },
        { name: 'Standing Calf Raise', sets: 3, reps: 15, repsMax: 20, note: 'third calf exposure · 0–1 RIR · rest 60 s' },
        { name: 'Stretch — Push Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    6: {
      title: 'Pull B — horizontal emphasis',
      items: [
        { name: 'Warm-up — Pull' },
        { name: 'Dumbbell Bent-Over Row', sets: 4, reps: 8, repsMax: 12, note: 'heaviest rowing of the cycle · 2 RIR · rest 2–3 min' },
        { name: 'One-Arm Dumbbell Row', sets: 3, reps: 10, repsMax: 12, note: 'per side · 2 RIR · rest 90 s' },
        { name: 'Dumbbell Pullover', sets: 3, reps: 12, repsMax: 15, note: '1–2 RIR · rest 90 s' },
        { name: 'Rear Delt Fly', sets: 3, reps: 15, repsMax: 20, note: 'chest-supported · 1 RIR · rest 60 s' },
        { name: 'Alternating Dumbbell Curl', sets: 3, reps: 10, repsMax: 12, note: '1–2 RIR · rest 90 s' },
        { name: 'Cross-Body Hammer Curl', sets: 2, reps: 12, repsMax: 15, note: '1–2 RIR · rest 60 s' },
        { name: 'Wrist Curl', sets: 2, reps: 15, note: '15 each direction · 1 RIR · rest 45 s · grip feeds the deadlift' },
        { name: 'Single-Leg Calf Raise', sets: 3, reps: 12, repsMax: 20, note: 'per leg · fourth calf exposure · 0–1 RIR · rest 60 s' },
        { name: 'Stretch — Pull Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    0: {
      title: 'Legs B — hinge emphasis',
      items: [
        { name: 'Warm-up — Legs B' },
        { name: 'Dumbbell Romanian Deadlift', sets: 4, reps: 8, repsMax: 12, note: 'heaviest hinge of the cycle · 2 RIR · rest 2–3 min · straps if grip limits you' },
        { name: 'Dumbbell Reverse Lunge', sets: 3, reps: 10, note: 'per leg · 2 RIR · rest 2 min · step back, not forward' },
        { name: 'Goblet Squat', sets: 3, reps: 12, repsMax: 15, note: '4 s down, 1 s pause · 2 RIR · rest 90 s · light load, high difficulty' },
        { name: 'Hamstring Slider Curl', sets: 2, reps: 6, repsMax: 10, note: 'or Nordic negative · 2 RIR · rest 90 s · progress slowly' },
        { name: 'Standing Calf Raise', sets: 4, reps: 15, repsMax: 20, note: 'loaded, straight knee · 0–1 RIR · rest 60 s' },
        { name: 'Tibialis Raise', sets: 2, reps: 15, repsMax: 20, note: '1 RIR · rest 45 s' },
        { name: 'Lying Leg Raise', sets: 3, reps: 10, repsMax: 15, note: '1 RIR · rest 60 s · lower back pressed down' },
        { name: 'Side Plank', minutes: 1, note: '2 × 30 s per side · rest 45 s' },
        { name: 'Stretch — Leg Day' },
        { name: 'Daily Shift Mobility' }
      ]
    }
  };

  /* The home week is the source document's own calendar: Mon push, Tue pull,
     Wed legs, Thu push, Fri pull, Sat legs, Sunday full rest. Six consecutive
     days is demanding, and the programme says so — if loads stall or sleep
     degrades, move Thursday to a rest day and run the same rolling cycle the
     site block uses. That is the correct adjustment, not a failure. */

  const HOME_WEEK = {
    1: {
      title: 'Push A — chest emphasis',
      items: [
        { name: 'Warm-up — Push (gym)' },
        { name: 'Barbell Bench Press', sets: 4, reps: 6, repsMax: 10, note: 'priority lift · 2 RIR · rest 3 min · spotter or safety pins, every set' },
        { name: 'Dumbbell Shoulder Press', sets: 3, reps: 8, repsMax: 12, note: 'seated, or a machine · 2 RIR · rest 2–3 min' },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 10, repsMax: 12, note: '30° bench · 2 RIR · rest 2 min' },
        { name: 'Cable Lateral Raise', sets: 3, reps: 12, repsMax: 20, note: '1 RIR · rest 75 s' },
        { name: 'Rope Triceps Pushdown', sets: 3, reps: 10, repsMax: 15, note: '1 RIR · rest 75 s' },
        { name: 'Overhead Cable Extension', sets: 2, reps: 12, repsMax: 15, note: 'long head · 1 RIR · rest 60 s' },
        { name: 'Cable Face Pull', sets: 2, reps: 15, note: '4 RIR · rest 45 s · cuff and scapular work' },
        { name: 'Stretch — Push Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    2: {
      title: 'Pull A — vertical emphasis',
      items: [
        { name: 'Warm-up — Pull (gym)' },
        { name: 'Pull-up', sets: 4, reps: 8, repsMax: 12, note: 'weighted when you can, or a pulldown · 2 RIR · rest 2–3 min · drive the elbows down' },
        { name: 'Chest-Supported Row', sets: 3, reps: 10, repsMax: 12, note: '2 RIR · rest 2 min · pause 1 s at the top' },
        { name: 'Straight-Arm Pulldown', sets: 3, reps: 12, repsMax: 15, note: 'lat isolation · 1 RIR · rest 90 s' },
        { name: 'Cable Face Pull', sets: 3, reps: 15, repsMax: 20, note: 'rear delt fly on the cable · 1 RIR · rest 60 s' },
        { name: 'Barbell Curl', sets: 3, reps: 8, repsMax: 12, note: 'EZ-bar if you have one · 1–2 RIR · rest 90 s' },
        { name: 'Hammer Curl', sets: 3, reps: 10, repsMax: 12, note: '1–2 RIR · rest 60 s' },
        { name: 'Dumbbell Shrug', sets: 2, reps: 12, repsMax: 15, note: 'barbell or dumbbell · 1 RIR · rest 60 s · 1 s pause at the top' },
        { name: 'Stretch — Pull Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    3: {
      title: 'Legs A — squat emphasis',
      items: [
        { name: 'Warm-up — Legs A (gym)' },
        { name: 'Barbell Back Squat', sets: 4, reps: 6, repsMax: 10, note: '2–3 RIR · rest 3 min · follow the re-entry ramp for the first block' },
        { name: 'Barbell Romanian Deadlift', sets: 3, reps: 8, repsMax: 12, note: '2 RIR · rest 2–3 min · straps fine, the hamstrings should fail not the grip' },
        { name: 'Leg Press', sets: 3, reps: 10, repsMax: 12, note: '2 RIR · rest 2 min' },
        { name: 'Seated Calf Raise', sets: 4, reps: 12, repsMax: 20, note: 'bent knee, soleus · 0–1 RIR · rest 60 s' },
        { name: 'Tibialis Raise', sets: 2, reps: 15, repsMax: 20, note: '1 RIR · rest 45 s · weighted if you have a tib bar' },
        { name: 'Cable Pallof Press', sets: 2, reps: 10, note: 'per side · anti-rotation · rest 60 s' },
        { name: 'Stretch — Leg Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    4: {
      title: 'Push B — shoulder emphasis',
      items: [
        { name: 'Warm-up — Push (gym)' },
        { name: 'Dumbbell Shoulder Press', sets: 4, reps: 6, repsMax: 10, note: 'seated, or a machine · heaviest pressing of the week · 2 RIR · rest 3 min' },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 8, repsMax: 12, note: 'barbell if you prefer · 2 RIR · rest 2–3 min' },
        { name: 'Cable Fly', sets: 3, reps: 12, repsMax: 15, note: 'or a pec deck · 1 RIR · rest 90 s · full stretch at the outside' },
        { name: 'Cable Lateral Raise', sets: 4, reps: 12, repsMax: 20, note: '1 RIR · rest 75 s' },
        { name: 'Cable Face Pull', sets: 3, reps: 15, repsMax: 20, note: 'rear delt fly on the cable · 1 RIR · rest 60 s' },
        { name: 'Close-Grip Bench Press', sets: 3, reps: 8, repsMax: 12, note: 'or a dip · 1–2 RIR · rest 90 s · feeds the bench directly' },
        { name: 'Standing Calf Raise', sets: 3, reps: 15, repsMax: 20, note: 'third calf exposure · 0–1 RIR · rest 60 s' },
        { name: 'Stretch — Push Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    5: {
      title: 'Pull B — horizontal emphasis',
      items: [
        { name: 'Warm-up — Pull (gym)' },
        { name: 'Barbell Row', sets: 4, reps: 8, repsMax: 12, note: 'torso ~45°, strict · 2 RIR · rest 3 min' },
        { name: 'Lat Pulldown', sets: 3, reps: 10, repsMax: 12, note: '2 RIR · rest 2 min' },
        { name: 'Seated Cable Row', sets: 3, reps: 10, repsMax: 12, note: '2 RIR · rest 90 s · let the shoulder blades travel forward at the front' },
        { name: 'Cable Face Pull', sets: 3, reps: 15, note: '1 RIR · rest 60 s' },
        { name: 'Incline Dumbbell Curl', sets: 3, reps: 10, repsMax: 12, note: 'biceps in the stretched position · 1–2 RIR · rest 90 s' },
        { name: 'Cable Curl', sets: 2, reps: 12, repsMax: 15, note: '1 RIR · rest 60 s' },
        { name: 'Wrist Curl', sets: 2, reps: 15, note: 'or a wrist roller · 1 RIR · rest 45 s · grip work for the deadlift' },
        { name: 'Seated Calf Raise', sets: 3, reps: 15, repsMax: 20, note: 'fourth calf exposure, bent knee · 0–1 RIR · rest 60 s' },
        { name: 'Stretch — Pull Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    6: {
      title: 'Legs B — deadlift emphasis',
      items: [
        { name: 'Warm-up — Legs B (gym)' },
        { name: 'Barbell Deadlift', sets: 4, reps: 5, repsMax: 8, note: 'the lagging lift · 2–3 RIR · rest 3 min · USE STRAPS and find out whether grip or hamstrings is the limit' },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 10, repsMax: 12, note: 'per leg · 2 RIR · rest 2 min' },
        { name: 'Lying Leg Curl', sets: 3, reps: 10, repsMax: 12, note: '2 RIR · rest 90 s · 3 s lowering' },
        { name: 'Leg Extension', sets: 2, reps: 12, repsMax: 15, note: 'rectus femoris · 1 RIR · rest 90 s' },
        { name: 'Standing Calf Raise', sets: 4, reps: 12, repsMax: 20, note: 'straight knee, gastrocnemius · 0–1 RIR · rest 60 s' },
        { name: 'Tibialis Raise', sets: 2, reps: 15, repsMax: 20, note: '1 RIR · rest 45 s' },
        { name: 'Cable Hip Abduction', sets: 2, reps: 15, note: 'per side · gluteus medius · 1 RIR · rest 45 s · stand tall, no leaning' },
        { name: 'Hanging Leg Raise', sets: 3, reps: 10, repsMax: 15, note: '1 RIR · rest 90 s' },
        { name: 'Stretch — Leg Day' },
        { name: 'Daily Shift Mobility' }
      ]
    },
    0: { title: 'Full rest', items: [{ name: 'Daily Shift Mobility' }] }
  };

  const PROGRAM_CONTEXTS = [
    {
      id: 'site',
      name: 'On site',
      blurb: 'Dumbbells only. Push, pull, legs, twice over — but the source runs it as a rolling 3-on/1-off cycle, so move the days by hand as it drifts.',
      week: SITE_WEEK
    },
    {
      id: 'home',
      name: 'At home',
      blurb: 'Full gym: barbell, rack, cables and machines. Mon to Sat, Sunday off, exactly as the programme is written.',
      week: HOME_WEEK
    }
  ];

  A.PROGRAM_EXERCISES = PROGRAM_EXERCISES;
  A.PROGRAM_CONTEXTS = PROGRAM_CONTEXTS;
  /* The default context, still exported under its old name so every existing
     caller and test keeps working. `programPlan` takes a context id now. */
  A.PROGRAM_WEEK = SITE_WEEK;

  if (typeof module !== 'undefined' && module.exports) module.exports = { PROGRAM_EXERCISES, PROGRAM_CONTEXTS, PROGRAM_WEEK: SITE_WEEK };
})(typeof window !== 'undefined' ? window : globalThis);
