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
      name: 'Warm-up — Push Day',
      muscles: ['chest','shoulders','arms'],
      category: 'Warm-up', unit: 'time', minutes: 9, icon: '🔥',
      how: [
        'Run straight through, no rest. 8–10 minutes total.',
        '1. Jumping jacks — 1 min',
        '2. Arm circles — 15 forward + 15 backward',
        '3. Shoulder rolls — 15',
        '4. Arm swings — 15',
        '5. Push-ups — 10',
        '6. Light dumbbell shoulder press — 15',
        '7. Light floor press — 10',
        'Use a weight you could lift 30 times. This is blood flow, not training.'
      ].join('\n')
    },
    {
      name: 'Warm-up — Pull Day',
      muscles: ['back','arms'],
      category: 'Warm-up', unit: 'time', minutes: 9, icon: '🔥',
      how: [
        'Run straight through, no rest. 8–10 minutes total.',
        '1. March or jog in place — 2 min',
        '2. Arm circles — 15 each direction',
        '3. Shoulder rolls — 15',
        '4. Cat-cow — 10',
        '5. Light dumbbell rows — 15',
        '6. Light curls — 15',
        'Cat-cow: on all fours, arch and round the spine slowly with the breath.'
      ].join('\n')
    },
    {
      name: 'Warm-up — Leg Day',
      muscles: ['legs','glutes'],
      category: 'Warm-up', unit: 'time', minutes: 9, icon: '🔥',
      how: [
        'Run straight through, no rest. 8–10 minutes total.',
        '1. Jumping jacks — 1 min (or light jogging — 2 min)',
        '2. Bodyweight squats — 15',
        '3. Walking lunges — 10 per leg',
        '4. Hip circles — 15',
        '5. Leg swings — 10 per leg',
        '6. Glute bridges — 15',
        'Knees track over the toes on every squat and lunge.'
      ].join('\n')
    }
  ];

  /* ---------- chest / shoulders / triceps ---------- */

  const PUSH = [
    {
      name: 'Dumbbell Floor Press',
      muscles: ['chest','arms'],
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
      muscles: ['chest','arms'],
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
      muscles: ['shoulders','arms'],
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
      muscles: ['shoulders'],
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
      muscles: ['chest'],
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
      muscles: ['shoulders','arms'],
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
      muscles: ['arms'],
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
      muscles: ['arms'],
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
      muscles: ['arms'],
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
      muscles: ['arms'],
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
      muscles: ['back','arms'],
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
      muscles: ['back','arms'],
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
      muscles: ['back','chest'],
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
      muscles: ['shoulders','back'],
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
      muscles: ['back','shoulders'],
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
      muscles: ['arms'],
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
      muscles: ['arms'],
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
      muscles: ['arms'],
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
      muscles: ['arms'],
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
      muscles: ['legs','glutes'],
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
      muscles: ['legs','glutes'],
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
      muscles: ['legs','glutes','back'],
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
      muscles: ['legs','glutes'],
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
      muscles: ['legs'],
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
      muscles: ['legs'],
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
      muscles: ['core'],
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
      muscles: ['core'],
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
      muscles: ['core'],
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
      muscles: ['core'],
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
      muscles: ['chest','shoulders','arms'],
      category: 'Stretch', unit: 'time', minutes: 6, icon: '🧘',
      how: [
        'Hold each, breathe, never bounce. 5–8 minutes total.',
        '1. Chest doorway stretch — 30 sec × 2',
        '2. Cross-body shoulder stretch — 30 sec per side',
        '3. Overhead triceps stretch — 30 sec per side',
        '4. Shoulder stretch — 30 sec per side',
        'Stretch to mild tension, not pain.'
      ].join('\n')
    },
    {
      name: 'Stretch — Pull Day',
      muscles: ['back','arms'],
      category: 'Stretch', unit: 'time', minutes: 6, icon: '🧘',
      how: [
        'Hold each, breathe, never bounce. 5–8 minutes total.',
        '1. Lat stretch — 30 sec per side',
        '2. Cross-body shoulder stretch — 30 sec per side',
        '3. Biceps wall stretch — 30 sec per side',
        '4. Upper-back stretch — 30 sec',
        '5. Forearm stretch — 20–30 sec per side'
      ].join('\n')
    },
    {
      name: 'Stretch — Leg Day',
      muscles: ['legs','glutes'],
      category: 'Stretch', unit: 'time', minutes: 6, icon: '🧘',
      how: [
        'Hold each, breathe, never bounce. 5–8 minutes total.',
        '1. Quad stretch — 30 sec per leg',
        '2. Hamstring stretch — 30 sec per leg',
        '3. Hip-flexor stretch — 30 sec per leg',
        '4. Calf stretch — 30 sec per leg',
        '5. Glute stretch — 30 sec per leg'
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
      muscles: ['legs','cardio'],
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

  const PROGRAM_EXERCISES = WARMUPS.concat(PUSH, PULL, LEGS, CORE, STRETCH);

  /* ---------- the week ----------
     `reps`/`repsMax` and `minutes` override the exercise defaults per day, so
     Friday can ask for a different rep range than Monday on the same lift. */

  const PROGRAM_WEEK = {
    1: {
      title: 'Chest + Shoulders + Triceps',
      items: [
        { name: 'Warm-up — Push Day' },
        { name: 'Dumbbell Floor Press', sets: 4, reps: 8, repsMax: 12 },
        { name: 'Dumbbell Squeeze Press', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Dumbbell Shoulder Press', sets: 3, reps: 8, repsMax: 12 },
        { name: 'Dumbbell Lateral Raise', sets: 4, reps: 12, repsMax: 15 },
        { name: 'Overhead Dumbbell Triceps Extension', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Dumbbell Skull Crusher', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Stretch — Push Day' }
      ]
    },
    2: {
      title: 'Back + Biceps + Rear Delts',
      items: [
        { name: 'Warm-up — Pull Day' },
        { name: 'One-Arm Dumbbell Row', sets: 4, reps: 8, repsMax: 12, note: 'per side' },
        { name: 'Dumbbell Bent-Over Row', sets: 3, reps: 8, repsMax: 12 },
        { name: 'Dumbbell Pullover', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Rear Delt Fly', sets: 3, reps: 12, repsMax: 15 },
        { name: 'Dumbbell Curl', sets: 3, reps: 8, repsMax: 12 },
        { name: 'Hammer Curl', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Stretch — Pull Day' }
      ]
    },
    3: {
      title: 'Quads + Hamstrings + Calves + Core',
      items: [
        { name: 'Warm-up — Leg Day' },
        { name: 'Goblet Squat', sets: 4, reps: 8, repsMax: 12 },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 8, repsMax: 12, note: 'per leg' },
        { name: 'Dumbbell Romanian Deadlift', sets: 4, reps: 8, repsMax: 12 },
        { name: 'Dumbbell Lunges', sets: 3, reps: 10, note: 'per leg' },
        { name: 'Standing Calf Raise', sets: 4, reps: 12, repsMax: 20 },
        { name: 'Reverse Crunch', sets: 3, reps: 10, repsMax: 15 },
        { name: 'Plank', minutes: 2, note: '3 × 30–60 sec' },
        { name: 'Stretch — Leg Day' }
      ]
    },
    4: {
      title: 'Recovery — no heavy strength training',
      items: [
        { name: 'Recovery Walk', minutes: 30, note: '20–40 min, easy' },
        { name: 'Light Mobility', minutes: 10 },
        { name: 'Full-Body Stretch', minutes: 12, note: '10–15 min' }
      ]
    },
    5: {
      title: 'Chest + Shoulders + Triceps',
      items: [
        { name: 'Warm-up — Push Day' },
        { name: 'Dumbbell Floor Press', sets: 4, reps: 8, repsMax: 12 },
        { name: 'Dumbbell Fly', sets: 3, reps: 10, repsMax: 15 },
        { name: 'Arnold Press', sets: 3, reps: 8, repsMax: 12 },
        { name: 'Dumbbell Lateral Raise', sets: 4, reps: 12, repsMax: 15 },
        { name: 'Rear Delt Fly', sets: 3, reps: 12, repsMax: 15 },
        { name: 'Single-Arm Overhead Triceps Extension', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Dumbbell Kickback', sets: 3, reps: 12, repsMax: 15 },
        { name: 'Stretch — Push Day' }
      ]
    },
    6: {
      title: 'Back + Biceps + Core',
      items: [
        { name: 'Warm-up — Pull Day' },
        { name: 'One-Arm Dumbbell Row', sets: 4, reps: 8, repsMax: 12, note: 'per side' },
        { name: 'Dumbbell Bent-Over Row', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Dumbbell Shrug', sets: 3, reps: 10, repsMax: 15 },
        { name: 'Rear Delt Fly', sets: 3, reps: 12, repsMax: 15 },
        { name: 'Alternating Dumbbell Curl', sets: 3, reps: 8, repsMax: 12, note: 'per arm' },
        { name: 'Cross-Body Hammer Curl', sets: 3, reps: 10, repsMax: 15 },
        { name: 'Lying Leg Raise', sets: 3, reps: 10, repsMax: 15 },
        { name: 'Dumbbell Russian Twist', sets: 3, reps: 12, repsMax: 20 },
        { name: 'Plank', minutes: 2, note: '3 × 30–60 sec' },
        { name: 'Stretch — Pull Day' }
      ]
    },
    0: {
      title: 'Legs + Calves + Core',
      items: [
        { name: 'Warm-up — Leg Day' },
        { name: 'Goblet Squat', sets: 4, reps: 10, repsMax: 12 },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 8, repsMax: 12, note: 'per leg' },
        { name: 'Dumbbell Romanian Deadlift', sets: 3, reps: 10, repsMax: 12 },
        { name: 'Single-Leg Calf Raise', sets: 4, reps: 12, repsMax: 20, note: 'per leg' },
        { name: 'Reverse Crunch', sets: 3, reps: 12, repsMax: 15 },
        { name: 'Dumbbell Side Bend', sets: 3, reps: 12, repsMax: 15, note: 'per side' },
        { name: 'Plank', minutes: 3, note: '3 × 45–60 sec' },
        { name: 'Stretch — Leg Day' }
      ]
    }
  };

  A.PROGRAM_EXERCISES = PROGRAM_EXERCISES;
  A.PROGRAM_WEEK = PROGRAM_WEEK;

  if (typeof module !== 'undefined' && module.exports) module.exports = { PROGRAM_EXERCISES, PROGRAM_WEEK };
})(typeof window !== 'undefined' ? window : globalThis);
