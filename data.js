// data.js — all Solunar Sprouts content and balance numbers. Rules live in state.js; this file is pure data.
// Every tunable number is here so balance can change without touching game code.
(function () {
  'use strict';

  const STATS = ['swim', 'fly', 'run', 'power', 'stamina'];
  const STAT_META = {
    swim: { label: 'Swim', color: '#2f8fd0' },
    fly: { label: 'Fly', color: '#9a6ad0' },
    run: { label: 'Run', color: '#df7126' },
    power: { label: 'Power', color: '#d24552' },
    stamina: { label: 'Stamina', color: '#2b8243' },
  };

  // ---------- Elements (battle types). strong: this element deals x1.5 to those; the reverse deals x0.75 ----------
  const ELEMENTS = {
    leaf: { label: 'Leaf', color: '#4fae3a', strong: ['water', 'stone'] },
    water: { label: 'Water', color: '#2f8fd0', strong: ['fire', 'stone'] },
    fire: { label: 'Fire', color: '#df5a26', strong: ['leaf', 'sweet'] },
    stone: { label: 'Stone', color: '#8c7a5e', strong: ['fire', 'sky'] },
    sky: { label: 'Sky', color: '#5fa8e8', strong: ['leaf', 'sweet'] },
    shadow: { label: 'Shadow', color: '#5e3a8e', strong: ['light', 'sky'] },
    light: { label: 'Light', color: '#e0a800', strong: ['shadow', 'water'] },
    sweet: { label: 'Sweet', color: '#e07ba0', strong: ['shadow', 'stone'] },
    normal: { label: 'Normal', color: '#8c93a8', strong: [] },
  };

  // ---------- Moves ----------
  // pow: base power (0 = no damage). acc: 0..1. fx (all optional):
  //   hits:n (multi-hit, pow per hit) · drain:0..1 (heal that share of damage) · heal:0..1 (heal share of max HP)
  //   buff:{stat,n} on self · debuff:{stat,n} on target (stat: atk|def|spd|eva|acc, n stages; either may also be an array of these)
  //   status:{type:'stun'|'poison'|'burn'|'sleep', chance} · recoil:0..1 of damage dealt · first:true (always goes first)
  //   sure:true (ignores evasion) · cleanse:true (remove own status) · crit:0..1 extra crit chance · once:true (usable once per battle)
  const M = (name, el, pow, acc, fx, desc) => ({ name, el, pow, acc, fx: fx || {}, desc });
  const MOVES = {
    // seedling + buds + bloom pools
    tackle: M('Tackle', 'normal', 35, 0.95, {}, 'A bouncy body bump.'),
    leaftoss: M('Leaf Toss', 'leaf', 40, 0.95, {}, 'Flicks a sharp leaf.'),
    sproutup: M('Sprout Up', 'leaf', 0, 1, { heal: 0.2, buff: { stat: 'def', n: 1 } }, 'Stands tall: heals a little and raises Defense.'),
    sunbeam: M('Sunbeam', 'light', 55, 0.95, {}, 'A warm beam of light.'),
    warmglow: M('Warm Glow', 'light', 0, 1, { heal: 0.3 }, 'Soaks up sun to heal.'),
    solarguard: M('Solar Guard', 'light', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Sharply raises Defense.'),
    nightslash: M('Night Slash', 'shadow', 60, 0.9, { crit: 0.15 }, 'A quick strike from the dark. Crits often.'),
    moonveil: M('Moon Veil', 'shadow', 0, 1, { buff: { stat: 'eva', n: 2 } }, 'Fades into moonlight. Raises Evasion.'),
    dreameater: M('Dream Eater', 'shadow', 45, 0.95, { drain: 0.5 }, 'Drains energy and heals.'),
    vinewhip: M('Vine Whip', 'leaf', 55, 0.95, {}, 'A springy vine lash.'),
    thornguard: M('Thorn Guard', 'leaf', 0, 1, { buff: { stat: 'def', n: 1 }, heal: 0.1 }, 'Grows thorns. Raises Defense.'),
    wildgrowth: M('Wild Growth', 'leaf', 0, 1, { buff: { stat: 'atk', n: 2 } }, 'Sharply raises Attack.'),
    radiance: M('Radiance', 'light', 70, 0.95, {}, 'A bright burst of petal light.'),
    sunhalo: M('Sun Halo', 'light', 0, 1, { heal: 0.4, cleanse: true }, 'Heals well and clears status.'),
    eclipse: M('Eclipse', 'shadow', 75, 0.9, { debuff: { stat: 'acc', n: 1 } }, 'Blots out the light. Lowers accuracy.'),
    nightbloom: M('Night Bloom', 'shadow', 0, 1, { buff: { stat: 'atk', n: 1 }, heal: 0.2 }, 'Blooms in the dark. Heals and raises Attack.'),
    bramble: M('Bramble Burst', 'leaf', 70, 0.95, { status: { type: 'poison', chance: 0.2 } }, 'Thorny burst. May poison.'),
    overgrow: M('Overgrow', 'leaf', 0, 1, { buff: { stat: 'atk', n: 1 }, heal: 0.25 }, 'Heals and raises Attack.'),
    // flower signatures
    solarblast: M('Solar Blast', 'light', 95, 0.85, {}, 'Sunflower signature. Huge beam of light.'),
    chimetoll: M('Chime Toll', 'sky', 60, 0.95, { status: { type: 'stun', chance: 0.3 } }, 'Bluebell signature. Ringing blow that may stun.'),
    petalstorm: M('Petal Storm', 'leaf', 22, 0.95, { hits: 4 }, 'Daisy signature. Four quick petal hits.'),
    tropicburst: M('Tropic Burst', 'fire', 85, 0.9, { status: { type: 'burn', chance: 0.25 } }, 'Hibiscus signature. Hot blossom burst. May burn.'),
    tidebloom: M('Tide Bloom', 'water', 60, 1, { drain: 0.6 }, 'Sea Lily signature. Heals with the tide.'),
    thornsurf: M('Thorn Surf', 'water', 80, 0.9, { debuff: { stat: 'def', n: 1 } }, 'Beach Rose signature. Lowers Defense.'),
    duskglow: M('Dusk Glow', 'light', 0, 1, { heal: 0.35, buff: { stat: 'spd', n: 1 } }, 'Primrose signature. Heals and speeds up.'),
    lunarbloom: M('Lunar Bloom', 'shadow', 90, 0.9, { crit: 0.1 }, 'Moonflower signature. A full-moon strike.'),
    toxicpetal: M('Toxic Petal', 'shadow', 50, 1, { status: { type: 'poison', chance: 0.7 } }, 'Nightshade signature. Usually poisons.'),
    sugarbeam: M('Sugar Beam', 'sweet', 90, 0.9, {}, 'Candy Tulip signature. Sweet laser.'),
    fluffcloud: M('Fluff Cloud', 'sweet', 0, 1, { buff: { stat: 'eva', n: 2 }, heal: 0.2 }, 'Cotton Rose signature. Hides in fluff.'),
    blossomblizzard: M('Blossom Blizzard', 'sweet', 28, 0.95, { hits: 3, status: { type: 'sleep', chance: 0.15 } }, 'Sugar Blossom signature. Three hits. May cause sleep.'),
    // meadow animals
    peck: M('Peck', 'sky', 35, 1, { first: true }, 'Always goes first.'),
    gust: M('Gust', 'sky', 50, 0.95, {}, 'A strong wind.'),
    skydive: M('Sky Dive', 'sky', 75, 0.85, {}, 'Dives from high up.'),
    quickhop: M('Quick Hop', 'normal', 0, 1, { buff: { stat: 'spd', n: 2 } }, 'Sharply raises Speed.'),
    doublekick: M('Double Kick', 'normal', 25, 0.95, { hits: 2 }, 'Kicks twice.'),
    burrowdash: M('Burrow Dash', 'stone', 60, 0.95, {}, 'Pops up from underground.'),
    headbutt: M('Headbutt', 'stone', 45, 0.95, { status: { type: 'stun', chance: 0.1 } }, 'May stun.'),
    ironwool: M('Iron Wool', 'stone', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Sharply raises Defense.'),
    ramcharge: M('Ram Charge', 'stone', 85, 0.9, { recoil: 0.2 }, 'Huge hit, some recoil.'),
    shellup: M('Shell Up', 'stone', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Hides in its shell.'),
    slowslam: M('Slow Slam', 'stone', 55, 1, { sure: true }, 'Never misses.'),
    ancientroll: M('Ancient Roll', 'stone', 75, 0.9, {}, 'Rolls like a boulder.'),
    flicker: M('Flicker', 'fire', 40, 1, { first: true }, 'A quick flame. Goes first.'),
    foxfire: M('Fox Fire', 'fire', 55, 0.95, { status: { type: 'burn', chance: 0.3 } }, 'May burn.'),
    tricktail: M('Trick Tail', 'normal', 0, 1, { debuff: { stat: 'acc', n: 2 } }, 'Sharply lowers accuracy.'),
    buzz: M('Buzz', 'sweet', 30, 1, { debuff: { stat: 'spd', n: 1 } }, 'Lowers Speed.'),
    honeysip: M('Honey Sip', 'sweet', 0, 1, { heal: 0.35 }, 'Heals.'),
    sting: M('Sting', 'sweet', 55, 0.95, { status: { type: 'poison', chance: 0.35 } }, 'May poison.'),
    splash: M('Splash', 'water', 35, 1, {}, 'A cheerful splash.'),
    quack: M('Quack', 'normal', 0, 1, { debuff: { stat: 'atk', n: 1 } }, 'Lowers Attack.'),
    divebomb: M('Dive Bomb', 'water', 65, 0.9, {}, 'Plunges in.'),
    bubble: M('Bubble', 'water', 40, 1, { debuff: { stat: 'spd', n: 1 } }, 'Lowers Speed.'),
    ripple: M('Ripple Heal', 'water', 0, 1, { heal: 0.3 }, 'Calm water heals.'),
    koileap: M('Koi Leap', 'water', 70, 0.9, { crit: 0.1 }, 'A lucky leap.'),
    hoot: M('Hoot', 'shadow', 0, 1, { status: { type: 'sleep', chance: 0.5 } }, 'May put the target to sleep.'),
    nightswoop: M('Night Swoop', 'shadow', 60, 0.95, {}, 'Silent dive.'),
    mooneye: M('Moon Eye', 'shadow', 0, 1, { buff: { stat: 'acc', n: 2 }, crit: 0 }, 'Sharply raises accuracy.'),
    glow: M('Glow', 'light', 0, 1, { buff: { stat: 'atk', n: 1 }, heal: 0.1 }, 'Raises Attack a little.'),
    flash: M('Flash', 'light', 35, 1, { status: { type: 'stun', chance: 0.35 } }, 'May stun.'),
    lanternbeam: M('Lantern Beam', 'light', 65, 0.95, {}, 'A steady beam.'),
    // beach animals
    pinch: M('Pinch', 'water', 45, 0.95, { crit: 0.2 }, 'Crits often.'),
    sidestep: M('Sidestep', 'normal', 0, 1, { buff: { stat: 'eva', n: 2 } }, 'Raises Evasion.'),
    crabhammer: M('Crab Hammer', 'water', 80, 0.9, { crit: 0.15 }, 'A mighty claw.'),
    swoop: M('Swoop', 'sky', 45, 0.95, {}, 'Quick dive.'),
    snatch: M('Snatch', 'sky', 40, 1, { drain: 0.5 }, 'Grabs a snack. Heals.'),
    seabreeze: M('Sea Breeze', 'sky', 0, 1, { heal: 0.25, buff: { stat: 'spd', n: 1 } }, 'Heals and speeds up.'),
    tailslap: M('Tail Slap', 'water', 45, 0.95, {}, 'A flat tail smack.'),
    otterfloat: M('Otter Float', 'water', 0, 1, { heal: 0.35 }, 'Floats and rests.'),
    aquaspin: M('Aqua Spin', 'water', 65, 0.95, {}, 'A spinning splash.'),
    bellyslide: M('Belly Slide', 'water', 50, 0.95, { first: true }, 'Goes first.'),
    blubber: M('Blubber', 'water', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Sharply raises Defense.'),
    icesplash: M('Ice Splash', 'water', 65, 0.9, { debuff: { stat: 'spd', n: 1 } }, 'Lowers Speed.'),
    echo: M('Echo', 'sky', 0, 1, { debuff: { stat: 'acc', n: 2 } }, 'Sharply lowers accuracy.'),
    wavejump: M('Wave Jump', 'water', 60, 0.95, {}, 'Leaps a wave.'),
    tidalcrash: M('Tidal Crash', 'water', 90, 0.85, {}, 'A crashing wave.'),
    regrow: M('Regrow', 'sweet', 0, 1, { heal: 0.45 }, 'Heals a lot.'),
    starspin: M('Star Spin', 'sweet', 20, 0.95, { hits: 3 }, 'Three spinning hits.'),
    twinkle: M('Twinkle', 'light', 30, 1, { status: { type: 'stun', chance: 0.4 } }, 'May stun.'),
    shellshield: M('Shell Shield', 'water', 0, 1, { buff: { stat: 'def', n: 3 } }, 'Hugely raises Defense.'),
    currentride: M('Current Ride', 'water', 55, 1, { buff: { stat: 'spd', n: 1 } }, 'Rides the current. Raises Speed.'),
    oldtide: M('Old Tide', 'water', 85, 0.9, { heal: 0.1 }, 'A slow, ancient wave.'),
    // moonlit animals
    screech: M('Screech', 'shadow', 0, 1, { debuff: { stat: 'def', n: 2 } }, 'Sharply lowers Defense.'),
    nip: M('Nip', 'shadow', 35, 1, { drain: 0.5 }, 'Heals half the damage.'),
    shadowflit: M('Shadow Flit', 'shadow', 65, 0.95, { buff: { stat: 'eva', n: 1 } }, 'Hits and raises Evasion.'),
    howl: M('Howl', 'shadow', 0, 1, { buff: { stat: 'atk', n: 2 } }, 'Sharply raises Attack.'),
    bite: M('Bite', 'shadow', 55, 0.95, { status: { type: 'stun', chance: 0.1 } }, 'May stun.'),
    moonfang: M('Moon Fang', 'shadow', 85, 0.9, { crit: 0.15 }, 'Crits often.'),
    dust: M('Moth Dust', 'light', 0, 0.9, { status: { type: 'sleep', chance: 0.6 } }, 'Often causes sleep.'),
    flutter: M('Flutter', 'sky', 0, 1, { buff: { stat: 'eva', n: 1 }, heal: 0.15 }, 'Heals a little. Raises Evasion.'),
    moonbeam: M('Moonbeam', 'light', 65, 0.95, {}, 'A cool silver beam.'),
    curl: M('Curl', 'stone', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Sharply raises Defense.'),
    spikeroll: M('Spike Roll', 'stone', 60, 0.95, {}, 'A spiky roll.'),
    quillburst: M('Quill Burst', 'stone', 20, 0.9, { hits: 4 }, 'Four quill hits.'),
    jellysting: M('Jelly Sting', 'water', 35, 1, { status: { type: 'poison', chance: 0.5 } }, 'Often poisons.'),
    glowpulse: M('Glow Pulse', 'light', 60, 0.95, {}, 'A pulse of light.'),
    drift: M('Drift', 'water', 0, 1, { heal: 0.3, cleanse: true }, 'Heals and clears status.'),
    // candy animals
    gummypunch: M('Gummy Punch', 'sweet', 50, 0.95, {}, 'A bouncy punch.'),
    chew: M('Chew', 'sweet', 0, 1, { heal: 0.35 }, 'Heals.'),
    sugarrush: M('Sugar Rush', 'sweet', 0, 1, { buff: [{ stat: 'atk', n: 1 }, { stat: 'spd', n: 1 }] }, 'Raises Attack and Speed.'),
    fluffpuff: M('Fluff Puff', 'sweet', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Sharply raises Defense.'),
    cottonbash: M('Cotton Bash', 'sweet', 50, 1, {}, 'Soft but solid.'),
    cloudnap: M('Cloud Nap', 'sweet', 0, 1, { heal: 0.5, once: true }, 'Heals half. Once per battle.'),
    syruptrap: M('Syrup Trap', 'sweet', 0, 1, { debuff: { stat: 'spd', n: 2 } }, 'Sharply lowers Speed.'),
    candyshell: M('Candy Shell', 'sweet', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Sharply raises Defense.'),
    swirlsmash: M('Swirl Smash', 'sweet', 70, 0.9, {}, 'A spiral slam.'),
    sprinkle: M('Sprinkle Shot', 'sweet', 18, 1, { hits: 3 }, 'Three sprinkle hits.'),
    sugarglide: M('Sugar Glide', 'sky', 0, 1, { buff: { stat: 'eva', n: 2 } }, 'Sharply raises Evasion.'),
    canedive: M('Candy Cane Dive', 'sweet', 75, 0.9, {}, 'Dives beak-first.'),
    fizz: M('Fizz', 'water', 35, 1, { status: { type: 'stun', chance: 0.3 } }, 'May stun.'),
    poprocks: M('Pop Rocks', 'sweet', 16, 1, { hits: 3 }, 'Three popping hits.'),
    geyser: M('Soda Geyser', 'water', 80, 0.9, {}, 'A fizzy blast.'),
    ink: M('Ink', 'shadow', 0, 1, { debuff: { stat: 'acc', n: 2 } }, 'Sharply lowers accuracy.'),
    jellygrab: M('Jelly Grab', 'sweet', 45, 1, { drain: 0.5 }, 'Heals half the damage.'),
    wobble: M('Wobble Wallop', 'sweet', 75, 0.9, {}, 'A wobbly smack.'),
    // newer animals (meadow)
    tongueflick: M('Tongue Flick', 'water', 35, 1, { first: true }, 'A sticky snap. Goes first.'),
    lilyhop: M('Lily Hop', 'leaf', 0, 1, { buff: [{ stat: 'spd', n: 1 }, { stat: 'eva', n: 1 }] }, 'Hops pad to pad. Raises Speed and Evasion.'),
    croak: M('Croak', 'water', 0, 0.9, { status: { type: 'sleep', chance: 0.5 } }, 'A sleepy song. May cause sleep.'),
    nutthrow: M('Nut Throw', 'normal', 22, 0.95, { hits: 2 }, 'Throws two acorns.'),
    scamper: M('Scamper', 'normal', 0, 1, { buff: { stat: 'spd', n: 2 } }, 'Sharply raises Speed.'),
    acornbomb: M('Acorn Bomb', 'leaf', 70, 0.9, {}, 'A big acorn from high up.'),
    wingdust: M('Wing Dust', 'sky', 30, 1, { status: { type: 'poison', chance: 0.4 } }, 'Scaly dust. May poison.'),
    silverwind: M('Silver Wind', 'sky', 45, 0.95, { buff: { stat: 'spd', n: 1 } }, 'A shimmering breeze. Raises Speed.'),
    petaldance: M('Petal Dance', 'leaf', 20, 0.95, { hits: 3 }, 'Three twirling hits.'),
    // newer animals (beach)
    beakjab: M('Beak Jab', 'sky', 45, 0.95, { crit: 0.2 }, 'Crits often.'),
    scoop: M('Scoop', 'water', 40, 1, { drain: 0.5 }, 'Scoops up a snack. Heals.'),
    fishdive: M('Fish Dive', 'water', 75, 0.9, {}, 'Plunges beak-first.'),
    bubblejet: M('Bubble Jet', 'water', 40, 1, { first: true }, 'A quick jet. Goes first.'),
    curltail: M('Curl Tail', 'water', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Holds on tight. Sharply raises Defense.'),
    tidedance: M('Tide Dance', 'water', 0, 1, { heal: 0.3, buff: { stat: 'spd', n: 1 } }, 'Heals and raises Speed.'),
    puffup: M('Puff Up', 'water', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Puffs up big. Sharply raises Defense.'),
    needlespray: M('Needle Spray', 'water', 18, 0.95, { hits: 3, status: { type: 'poison', chance: 0.15 } }, 'Three spines. May poison.'),
    spinetackle: M('Spine Tackle', 'stone', 70, 0.9, { recoil: 0.1 }, 'A spiky slam.'),
    // newer animals (moonlit)
    swipe: M('Swipe', 'shadow', 45, 0.95, { crit: 0.2 }, 'Quick paws. Crits often.'),
    trashtoss: M('Trash Toss', 'normal', 0, 1, { debuff: { stat: 'acc', n: 2 } }, 'Throws junk. Sharply lowers accuracy.'),
    masquerade: M('Masquerade', 'shadow', 0, 1, { buff: [{ stat: 'eva', n: 1 }, { stat: 'atk', n: 1 }] }, 'Raises Evasion and Attack.'),
    lure: M('Lure', 'light', 0, 0.9, { status: { type: 'stun', chance: 0.5 } }, 'A dazzling light. May stun.'),
    deepbite: M('Deep Bite', 'shadow', 50, 0.95, { drain: 0.5 }, 'Heals half the damage.'),
    lanternflash: M('Lantern Flash', 'light', 80, 0.9, {}, 'A blinding burst.'),
    antlerram: M('Antler Ram', 'stone', 55, 0.95, {}, 'Charges with its antlers.'),
    moonleap: M('Moon Leap', 'light', 0, 1, { buff: [{ stat: 'spd', n: 1 }, { stat: 'eva', n: 1 }] }, 'Leaps into the moonlight.'),
    starcharge: M('Star Charge', 'light', 85, 0.9, {}, 'A shooting-star charge.'),
    // newer animals (candy)
    marshhop: M('Marsh Hop', 'sweet', 40, 1, { first: true }, 'A bouncy hop. Goes first.'),
    puffpunch: M('Puff Punch', 'sweet', 55, 0.95, { debuff: { stat: 'atk', n: 1 } }, 'Soft punch. Lowers Attack.'),
    toasty: M('Toasty', 'fire', 0, 1, { heal: 0.35, buff: { stat: 'def', n: 1 } }, 'Warms up golden. Heals, raises Defense.'),
    nibble: M('Nibble', 'sweet', 35, 1, { first: true }, 'Tiny bites. Goes first.'),
    cocoadust: M('Cocoa Dust', 'sweet', 0, 1, { debuff: { stat: 'acc', n: 2 } }, 'Sharply lowers accuracy.'),
    fudgeslam: M('Fudge Slam', 'sweet', 75, 0.9, {}, 'A heavy chocolate slam.'),
    licoricelash: M('Licorice Lash', 'sweet', 45, 0.95, { status: { type: 'stun', chance: 0.2 } }, 'May stun.'),
    twist: M('Twist', 'sweet', 0, 1, { buff: { stat: 'eva', n: 2 } }, 'Twists away. Sharply raises Evasion.'),
    sugarshock: M('Sugar Shock', 'water', 80, 0.9, { status: { type: 'stun', chance: 0.15 } }, 'A fizzy zap. May stun.'),
    // living plants (meadow)
    sunnyspin: M('Sunny Spin', 'light', 45, 0.95, {}, 'A dizzy, sunny twirl.'),
    seedspit: M('Seed Spit', 'leaf', 18, 0.95, { hits: 3 }, 'Spits three seeds.'),
    photosynth: M('Photosynthesis', 'light', 0, 1, { heal: 0.4 }, 'Soaks up light to heal.'),
    sporepuff: M('Spore Puff', 'stone', 0, 0.9, { status: { type: 'sleep', chance: 0.5 } }, 'A sleepy puff. May cause sleep.'),
    capbonk: M('Cap Bonk', 'stone', 55, 0.95, { status: { type: 'stun', chance: 0.1 } }, 'A bouncy headbutt. May stun.'),
    shroomshield: M('Shroom Shield', 'stone', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Hides under its cap. Sharply raises Defense.'),
    puffdrift: M('Puff Drift', 'sky', 0, 1, { buff: { stat: 'eva', n: 2 } }, 'Floats away. Sharply raises Evasion.'),
    seedstorm: M('Seed Storm', 'sky', 16, 0.95, { hits: 4 }, 'Four fluffy seed hits.'),
    windride: M('Wind Ride', 'sky', 70, 0.9, {}, 'Rides a gust into the target.'),
    luckyleaf: M('Lucky Leaf', 'leaf', 40, 1, { crit: 0.3 }, 'Often lands a lucky hit.'),
    clovercharm: M('Clover Charm', 'leaf', 0, 1, { heal: 0.25, cleanse: true }, 'Heals and clears status.'),
    fourleaf: M('Four Leaf', 'leaf', 20, 0.95, { hits: 4 }, 'Four leafy hits.'),
    // living plants (beach)
    needlejab: M('Needle Jab', 'stone', 40, 1, { first: true }, 'A quick poke. Goes first.'),
    cactusguard: M('Cactus Guard', 'stone', 0, 1, { buff: { stat: 'def', n: 2 } }, 'Prickles up. Sharply raises Defense.'),
    prickleburst: M('Prickle Burst', 'stone', 22, 0.9, { hits: 3 }, 'Three prickly hits.'),
    kelpwrap: M('Kelp Wrap', 'water', 40, 1, { debuff: { stat: 'spd', n: 1 } }, 'Wraps up the target. Lowers Speed.'),
    tidetangle: M('Tide Tangle', 'water', 0, 0.9, { status: { type: 'stun', chance: 0.5 } }, 'Tangles the target. May stun.'),
    seasway: M('Sea Sway', 'water', 0, 1, { heal: 0.3, buff: { stat: 'eva', n: 1 } }, 'Sways with the waves. Heals.'),
    coconutbonk: M('Coconut Bonk', 'stone', 60, 0.9, { status: { type: 'stun', chance: 0.15 } }, 'Ouch! May stun.'),
    palmfan: M('Palm Fan', 'sky', 35, 1, { buff: { stat: 'spd', n: 1 } }, 'A breezy fan. Raises Speed.'),
    hardshell: M('Hard Shell', 'stone', 0, 1, { buff: { stat: 'def', n: 3 } }, 'Hugely raises Defense.'),
    // living plants (moonlit)
    glowspore: M('Glow Spore', 'light', 35, 1, { status: { type: 'stun', chance: 0.3 } }, 'Glittering spores. May stun.'),
    capglow: M('Cap Glow', 'light', 0, 1, { heal: 0.25, buff: { stat: 'atk', n: 1 } }, 'Heals and raises Attack.'),
    lanternpuff: M('Lantern Puff', 'light', 65, 0.95, {}, 'A bright puff of light.'),
    snapjaw: M('Snap Jaw', 'shadow', 55, 0.95, { crit: 0.15 }, 'Snap! Crits often.'),
    thornlash: M('Thorn Lash', 'shadow', 45, 0.95, { status: { type: 'poison', chance: 0.3 } }, 'May poison.'),
    devour: M('Gobble', 'shadow', 50, 0.95, { drain: 0.5 }, 'Gobbles energy. Heals half the damage.'),
    lunarpetal: M('Lunar Petal', 'shadow', 50, 1, {}, 'A silver petal slice.'),
    lotusrest: M('Lotus Rest', 'water', 0, 1, { heal: 0.45 }, 'Rests on the water. Heals a lot.'),
    moonripple: M('Moon Ripple', 'water', 60, 0.95, { debuff: { stat: 'acc', n: 1 } }, 'Lowers accuracy.'),
    // living plants (candy)
    lollispin: M('Lolli Spin', 'sweet', 45, 0.95, {}, 'A swirly spin.'),
    sugarpetal: M('Sugar Petal', 'sweet', 20, 1, { hits: 3 }, 'Three sugary petals.'),
    sweetscent: M('Sweet Scent', 'sweet', 0, 1, { debuff: { stat: 'eva', n: 2 } }, 'Sharply lowers Evasion.'),
    marshpuff: M('Marsh Puff', 'sweet', 0, 1, { buff: { stat: 'def', n: 2 }, heal: 0.1 }, 'Puffs up soft. Raises Defense.'),
    gooeycap: M('Gooey Cap', 'sweet', 45, 1, { debuff: { stat: 'spd', n: 1 } }, 'Sticky! Lowers Speed.'),
    sleepyspore: M('Sleepy Spore', 'sweet', 0, 0.9, { status: { type: 'sleep', chance: 0.55 } }, 'Often causes sleep.'),
    twirlwhip: M('Twirl Whip', 'sweet', 50, 0.95, {}, 'A twirly vine whip.'),
    stickyvine: M('Sticky Vine', 'sweet', 0, 1, { debuff: { stat: 'spd', n: 2 } }, 'Sharply lowers Speed.'),
    licoknot: M('Licorice Knot', 'sweet', 75, 0.9, { status: { type: 'stun', chance: 0.1 } }, 'Ties the target in knots.'),
    fizzbloom: M('Fizz Bloom', 'water', 40, 1, { status: { type: 'stun', chance: 0.2 } }, 'A fizzy flower pop. May stun.'),
    lilyfloat: M('Lily Float', 'water', 0, 1, { heal: 0.3, buff: { stat: 'spd', n: 1 } }, 'Heals and raises Speed.'),
    candyrain: M('Candy Rain', 'sweet', 16, 0.95, { hits: 4 }, 'Four candy drops.'),
    // rare creatures
    pixiedust: M('Pixie Dust', 'light', 40, 1, { status: { type: 'sleep', chance: 0.4 } }, 'May cause sleep.'),
    fairykiss: M('Fairy Kiss', 'light', 0, 1, { heal: 0.55, cleanse: true }, 'Big heal. Clears status.'),
    starlight: M('Starlight', 'light', 95, 0.9, {}, 'A shower of stars.'),
    hornbeam: M('Horn Beam', 'light', 85, 0.95, {}, 'A rainbow beam from its horn.'),
    rainbowmane: M('Rainbow Mane', 'light', 0, 1, { buff: { stat: 'atk', n: 1 }, heal: 0.2 }, 'Heals and raises Attack.'),
    purify: M('Purify', 'light', 0, 1, { heal: 0.4, cleanse: true, buff: { stat: 'def', n: 1 } }, 'Heals, cleanses, raises Defense.'),
    stomp: M('Stomp', 'stone', 75, 0.95, { status: { type: 'stun', chance: 0.2 } }, 'May stun.'),
    roar: M('Roar', 'stone', 0, 1, { debuff: { stat: 'atk', n: 2 } }, 'Sharply lowers Attack.'),
    meteortail: M('Meteor Tail', 'stone', 110, 0.85, {}, 'A prehistoric smash.'),
    ember: M('Ember', 'fire', 55, 1, { status: { type: 'burn', chance: 0.2 } }, 'May burn.'),
    dragonscale: M('Dragon Scale', 'fire', 0, 1, { buff: { stat: 'def', n: 2 }, heal: 0.15 }, 'Heals and sharply raises Defense.'),
    dragonbreath: M('Dragon Breath', 'fire', 120, 0.85, { status: { type: 'burn', chance: 0.3 } }, 'The strongest fire there is.'),
    flamewing: M('Flame Wing', 'fire', 75, 0.95, { status: { type: 'burn', chance: 0.2 } }, 'May burn.'),
    rebirth: M('Rebirth', 'fire', 0, 1, { heal: 1, cleanse: true, once: true }, 'Fully heals. Once per battle.'),
    sunflare: M('Sun Flare', 'fire', 105, 0.9, {}, 'A blinding flare.'),
    talon: M('Talon', 'sky', 65, 0.95, { crit: 0.15 }, 'Crits often.'),
    skyroar: M('Sky Roar', 'sky', 0, 1, { debuff: { stat: 'def', n: 2 }, buff: { stat: 'spd', n: 1 } }, 'Lowers Defense, raises Speed.'),
    stormdive: M('Storm Dive', 'sky', 100, 0.85, {}, 'A thunderous dive.'),
    whirlpool: M('Whirlpool', 'water', 50, 0.95, { status: { type: 'stun', chance: 0.35 } }, 'May stun.'),
    crush: M('Crush', 'water', 90, 0.9, {}, 'Eight arms squeeze.'),
    abysswave: M('Abyss Wave', 'water', 110, 0.85, { debuff: { stat: 'spd', n: 1 } }, 'A wave from the deep.'),
    foxwisp: M('Fox Wisp', 'fire', 65, 1, {}, 'A floating flame.'),
    illusion: M('Illusion', 'shadow', 0, 1, { buff: { stat: 'eva', n: 3 } }, 'Hugely raises Evasion.'),
    ninefold: M('Ninefold Flame', 'fire', 100, 0.9, { status: { type: 'burn', chance: 0.3 } }, 'Nine flames at once.'),
    frostbite: M('Frost Bite', 'water', 60, 0.95, { debuff: { stat: 'spd', n: 1 } }, 'Lowers Speed.'),
    snowball: M('Snowball', 'water', 25, 1, { hits: 3 }, 'Three snowballs.'),
    avalanche: M('Avalanche', 'stone', 105, 0.85, {}, 'Buries the target in snow.'),
  };

  // ---------- Animals: caught in the garden areas, absorbed by Sprouts ----------
  // where: land | coast | water | air. time: day | night | any. gives: stat XP per absorb (negatives lower XP).
  // part: body part grown (+0.34 size per absorb, max 1). moves: 3 moves, unlocked at 1 / 3 / 6 absorbed.
  // nature: shift toward Sun (+) or Moon (-). happy: mood change.
  const A = (name, area, where, time, gives, part, el, moves, nature, blurb) => ({ name, area, where, time, gives, part, el, moves, nature: nature || 0, blurb });
  const P = (...a) => Object.assign(A(...a), { kind: 'plant' }); // living plants and flowers
  const ANIMALS = {
    sparrow: A('Sparrow', 'meadow', 'land', 'day', { fly: 14, run: 5 }, 'wings', 'sky', ['peck', 'gust', 'skydive'], 1, 'Quick little flier.'),
    hare: A('Hare', 'meadow', 'land', 'day', { run: 14, stamina: 5 }, 'ears', 'normal', ['quickhop', 'doublekick', 'burrowdash'], 0, 'Fast, springy legs.'),
    ram: A('Ram', 'meadow', 'land', 'any', { power: 14, stamina: 5, swim: -3 }, 'horns', 'stone', ['headbutt', 'ironwool', 'ramcharge'], 0, 'Strong, hates water.'),
    tortoise: A('Tortoise', 'meadow', 'land', 'day', { stamina: 14, swim: 5, run: -3 }, 'shell', 'stone', ['shellup', 'slowslam', 'ancientroll'], 1, 'Tough and patient.'),
    fox: A('Fox', 'meadow', 'land', 'night', { run: 9, power: 8 }, 'tail', 'fire', ['flicker', 'foxfire', 'tricktail'], -2, 'Clever night hunter.'),
    bee: A('Bee', 'meadow', 'air', 'day', { fly: 9, power: 7 }, 'antennae', 'sweet', ['buzz', 'honeysip', 'sting'], 1, 'Busy and brave.'),
    duck: A('Duck', 'meadow', 'water', 'day', { swim: 10, fly: 6 }, 'fins', 'water', ['splash', 'quack', 'divebomb'], 1, 'At home on the water.'),
    koi: A('Koi', 'meadow', 'water', 'any', { swim: 15, stamina: 4 }, 'fins', 'water', ['bubble', 'ripple', 'koileap'], 2, 'A lucky fish.'),
    owl: A('Owl', 'meadow', 'air', 'night', { fly: 10, stamina: 7 }, 'wings', 'shadow', ['hoot', 'nightswoop', 'mooneye'], -3, 'Wise and silent.'),
    firefly: A('Firefly', 'meadow', 'air', 'night', { stamina: 9, fly: 6 }, 'antennae', 'light', ['glow', 'flash', 'lanternbeam'], 2, 'A tiny lantern.'),
    crab: A('Crab', 'beach', 'coast', 'any', { power: 14, swim: 6, fly: -3 }, 'claws', 'water', ['pinch', 'sidestep', 'crabhammer'], 0, 'Snappy claws.'),
    seagull: A('Seagull', 'beach', 'air', 'day', { fly: 13, swim: 5 }, 'wings', 'sky', ['swoop', 'snatch', 'seabreeze'], -1, 'Cheeky sea bird.'),
    otter: A('Otter', 'beach', 'water', 'day', { swim: 13, run: 6 }, 'fins', 'water', ['tailslap', 'otterfloat', 'aquaspin'], 1, 'Playful swimmer.'),
    seal: A('Seal', 'beach', 'coast', 'any', { swim: 10, stamina: 10, run: -3 }, 'fins', 'water', ['bellyslide', 'blubber', 'icesplash'], 1, 'Sleek and sturdy.'),
    dolphin: A('Dolphin', 'beach', 'water', 'day', { swim: 16, fly: 5 }, 'fins', 'water', ['echo', 'wavejump', 'tidalcrash'], 2, 'Smart and fast.'),
    starfish: A('Starfish', 'beach', 'coast', 'night', { stamina: 12, swim: 5 }, 'spots', 'sweet', ['regrow', 'starspin', 'twinkle'], 1, 'Heals itself.'),
    seaturtle: A('Sea Turtle', 'beach', 'water', 'night', { stamina: 12, swim: 9 }, 'shell', 'water', ['shellshield', 'currentride', 'oldtide'], 2, 'An old ocean traveller.'),
    bat: A('Bat', 'moonlit', 'air', 'any', { fly: 11, run: 8, power: -3 }, 'batwings', 'shadow', ['screech', 'nip', 'shadowflit'], -3, 'Loves the dark.'),
    wolf: A('Wolf', 'moonlit', 'land', 'night', { run: 10, power: 10 }, 'ears', 'shadow', ['howl', 'bite', 'moonfang'], -3, 'A loyal hunter.'),
    moth: A('Moth', 'moonlit', 'air', 'any', { fly: 10, stamina: 7 }, 'antennae', 'light', ['dust', 'flutter', 'moonbeam'], 0, 'Drawn to lanterns.'),
    hedgehog: A('Hedgehog', 'moonlit', 'land', 'any', { stamina: 10, power: 7 }, 'spikes', 'stone', ['curl', 'spikeroll', 'quillburst'], 0, 'A prickly ball.'),
    jellyfish: A('Jellyfish', 'moonlit', 'water', 'night', { swim: 11, stamina: 7 }, 'antennae', 'water', ['jellysting', 'glowpulse', 'drift'], -1, 'Glows in the deep.'),
    gummybear: A('Gummy Bear', 'candy', 'land', 'any', { power: 14, stamina: 6, fly: -3 }, 'ears', 'sweet', ['gummypunch', 'chew', 'sugarrush'], 1, 'Squishy and strong.'),
    cottonsheep: A('Cotton Sheep', 'candy', 'land', 'day', { stamina: 14, fly: 6 }, 'fluff', 'sweet', ['fluffpuff', 'cottonbash', 'cloudnap'], 2, 'Made of candy floss.'),
    lollisnail: A('Lolli Snail', 'candy', 'land', 'night', { stamina: 10, power: 8, run: -4 }, 'shell', 'sweet', ['syruptrap', 'candyshell', 'swirlsmash'], -1, 'Slow but sweet.'),
    sugarfinch: A('Sugar Finch', 'candy', 'air', 'day', { fly: 15, run: 4 }, 'wings', 'sweet', ['sprinkle', 'sugarglide', 'canedive'], 1, 'Sings in sprinkles.'),
    sodafish: A('Soda Fish', 'candy', 'water', 'any', { swim: 14, run: 6 }, 'fins', 'water', ['fizz', 'poprocks', 'geyser'], 0, 'Fizzy and fast.'),
    jellyocto: A('Jelly Octopus', 'candy', 'water', 'night', { swim: 10, power: 10 }, 'tentacles', 'sweet', ['ink', 'jellygrab', 'wobble'], -2, 'Wobbly and strong.'),
    // newer animals
    frog: A('Frog', 'meadow', 'coast', 'any', { swim: 9, run: 8 }, 'fins', 'water', ['tongueflick', 'lilyhop', 'croak'], 1, 'Hops between land and water.'),
    squirrel: A('Squirrel', 'meadow', 'land', 'day', { run: 10, fly: 6 }, 'tail', 'normal', ['nutthrow', 'scamper', 'acornbomb'], 1, 'A busy, bushy-tailed climber.'),
    butterfly: A('Butterfly', 'meadow', 'air', 'day', { fly: 12, stamina: 5 }, 'wings', 'sky', ['wingdust', 'silverwind', 'petaldance'], 2, 'Floats from flower to flower.'),
    pelican: A('Pelican', 'beach', 'air', 'day', { fly: 10, swim: 8 }, 'wings', 'sky', ['beakjab', 'scoop', 'fishdive'], 0, 'Carries lunch in its beak.'),
    seahorse: A('Seahorse', 'beach', 'water', 'any', { swim: 11, stamina: 7 }, 'fins', 'water', ['bubblejet', 'curltail', 'tidedance'], 1, 'Dances in the waves.'),
    pufferfish: A('Pufferfish', 'beach', 'water', 'night', { stamina: 11, power: 7 }, 'spikes', 'water', ['puffup', 'needlespray', 'spinetackle'], -1, 'Puffs up when surprised.'),
    raccoon: A('Raccoon', 'moonlit', 'land', 'night', { run: 9, power: 8 }, 'tail', 'shadow', ['swipe', 'trashtoss', 'masquerade'], -2, 'A masked night bandit.'),
    anglerfish: A('Anglerfish', 'moonlit', 'water', 'night', { swim: 10, power: 9 }, 'antennae', 'light', ['lure', 'deepbite', 'lanternflash'], -2, 'Carries its own lantern.'),
    moondeer: A('Moon Deer', 'moonlit', 'land', 'any', { run: 12, stamina: 6 }, 'horns', 'light', ['antlerram', 'moonleap', 'starcharge'], 2, 'Silver spots like stars.'),
    marshbunny: A('Marsh Bunny', 'candy', 'land', 'day', { run: 11, stamina: 7 }, 'ears', 'sweet', ['marshhop', 'puffpunch', 'toasty'], 2, 'Squishy as a marshmallow.'),
    chocomouse: A('Choco Mouse', 'candy', 'land', 'night', { run: 10, power: 7 }, 'ears', 'sweet', ['nibble', 'cocoadust', 'fudgeslam'], -1, 'Smells like cocoa.'),
    // living plants: caught and bonded just like animals (kind: 'plant')
    sunbuddy: P('Sunny Sunflower', 'meadow', 'land', 'day', { stamina: 8, power: 6 }, 'petals', 'light', ['sunnyspin', 'seedspit', 'photosynth'], 3, 'Always turns to face the sun.'),
    shroomy: P('Shroomy', 'meadow', 'land', 'night', { stamina: 10, power: 5 }, 'mushcap', 'stone', ['sporepuff', 'capbonk', 'shroomshield'], -2, 'A little walking mushroom.'),
    puffball: P('Dandelion Puff', 'meadow', 'air', 'day', { fly: 12, run: 4 }, 'fluff', 'sky', ['puffdrift', 'seedstorm', 'windride'], 1, 'Drifts wherever the wind goes.'),
    cloverkin: P('Lucky Clover', 'meadow', 'land', 'any', { run: 8, stamina: 6 }, 'leafears', 'leaf', ['luckyleaf', 'clovercharm', 'fourleaf'], 2, 'Four leaves, lots of luck.'),
    cactling: P('Cactling', 'beach', 'coast', 'day', { power: 10, stamina: 6, swim: -3 }, 'spikes', 'stone', ['needlejab', 'cactusguard', 'prickleburst'], 0, 'Prickly outside, soft inside.'),
    kelpie: P('Kelpie', 'beach', 'water', 'any', { swim: 11, stamina: 6 }, 'vines', 'water', ['kelpwrap', 'tidetangle', 'seasway'], 1, 'A wiggly bunch of kelp.'),
    coconut: P('Coco Sprout', 'beach', 'land', 'day', { power: 9, stamina: 7 }, 'leafears', 'stone', ['coconutbonk', 'palmfan', 'hardshell'], 1, 'A coconut with a palm-leaf hairdo.'),
    glowcap: P('Glowcap', 'moonlit', 'land', 'any', { stamina: 9, fly: 5 }, 'mushcap', 'light', ['glowspore', 'capglow', 'lanternpuff'], 1, 'A mushroom that glows in the dark.'),
    snapvine: P('Snapvine', 'moonlit', 'land', 'night', { power: 12, run: 4 }, 'thorns', 'shadow', ['snapjaw', 'thornlash', 'devour'], -3, 'A snappy flytrap. Friendly, mostly.'),
    moonlotus: P('Moon Lotus', 'moonlit', 'water', 'night', { swim: 8, stamina: 8 }, 'petals', 'water', ['lunarpetal', 'lotusrest', 'moonripple'], -1, 'Opens only under the moon.'),
    lollibloom: P('Lollibloom', 'candy', 'land', 'day', { run: 8, power: 6 }, 'petals', 'sweet', ['lollispin', 'sugarpetal', 'sweetscent'], 2, 'A flower made of lollipop.'),
    marshroom: P('Marshroom', 'candy', 'land', 'night', { stamina: 11, power: 4 }, 'mushcap', 'sweet', ['marshpuff', 'gooeycap', 'sleepyspore'], -1, 'A squishy marshmallow mushroom.'),
    licovine: P('Licorice Vine', 'candy', 'land', 'any', { power: 9, run: 6 }, 'vines', 'sweet', ['twirlwhip', 'stickyvine', 'licoknot'], 0, 'Twists and curls everywhere.'),
    sugarlily: P('Sugar Lily', 'candy', 'water', 'day', { swim: 10, fly: 4 }, 'petals', 'water', ['fizzbloom', 'lilyfloat', 'candyrain'], 1, 'Floats on the soda sea.'),
    licoriceeel: A('Licorice Eel', 'candy', 'water', 'any', { swim: 12, run: 6 }, 'fins', 'sweet', ['licoricelash', 'twist', 'sugarshock'], -1, 'Long, twisty and chewy.'),
  };

  // ---------- Rare creatures: bought with coins, absorbed like animals but much stronger ----------
  const R = (name, price, gives, parts, el, moves, nature, blurb) => ({ name, price, gives, parts, el, moves, nature, blurb, rare: true });
  const RARES = {
    fairy: R('Fairy', 750, { fly: 45, stamina: 20 }, { fairywings: 1 }, 'light', ['pixiedust', 'fairykiss', 'starlight'], 20, 'Tiny, kind and magical.'),
    unicorn: R('Unicorn', 1250, { run: 45, stamina: 30 }, { unihorn: 1 }, 'light', ['hornbeam', 'rainbowmane', 'purify'], 30, 'A rainbow-horned runner.'),
    kitsune: R('Kitsune', 1600, { run: 35, power: 30 }, { tail: 1, multitail: 1 }, 'fire', ['foxwisp', 'illusion', 'ninefold'], -20, 'A nine-tailed trickster.'),
    yeti: R('Yeti', 1750, { stamina: 45, power: 30, run: -10 }, { fluff: 1, horns: 0.5 }, 'water', ['frostbite', 'snowball', 'avalanche'], 0, 'Big, fluffy and cold.'),
    griffin: R('Griffin', 1900, { fly: 40, power: 35 }, { wings: 1, claws: 1 }, 'sky', ['talon', 'skyroar', 'stormdive'], 0, 'Half eagle, all courage.'),
    dinosaur: R('Dinosaur', 2100, { power: 50, stamina: 30, run: -10 }, { spikes: 1, tail: 1 }, 'stone', ['stomp', 'roar', 'meteortail'], 0, 'An ancient giant.'),
    kraken: R('Kraken', 2400, { swim: 60, power: 30 }, { tentacles: 1, fins: 1 }, 'water', ['whirlpool', 'crush', 'abysswave'], -30, 'Lord of the deep sea.'),
    phoenix: R('Phoenix', 3000, { fly: 55, stamina: 40 }, { flamewings: 1 }, 'fire', ['flamewing', 'rebirth', 'sunflare'], 40, 'Reborn from its own flames.'),
    dragon: R('Dragon', 4000, { power: 50, fly: 50, stamina: 20 }, { dragonwings: 1, horns: 1, tail: 1 }, 'fire', ['ember', 'dragonscale', 'dragonbreath'], -10, 'The rarest of them all.'),
  };

  // ---------- Evolution ----------
  // Stage 0 Seedling -> Stage 1 Bud (nature decides Sun / Moon / Wild) -> Stage 2 Bloom (area + nature decide the flower).
  const EVO = { budAt: 15, bloomAt: 40, sunNature: 25, moonNature: -25 }; // thresholds are total stat levels
  const FORMS = {
    seedling: { name: 'Seedling', stage: 0, el: 'leaf', moves: ['tackle', 'leaftoss', 'sproutup'] },
    sunbud: { name: 'Sun Bud', stage: 1, el: 'light', nature: 'sun', moves: ['sunbeam', 'warmglow', 'solarguard'] },
    moonbud: { name: 'Moon Bud', stage: 1, el: 'shadow', nature: 'moon', moves: ['nightslash', 'moonveil', 'dreameater'] },
    wildbud: { name: 'Wild Bud', stage: 1, el: 'leaf', nature: 'wild', moves: ['vinewhip', 'thornguard', 'wildgrowth'] },
  };
  const BLOOM_POOL = { sun: ['radiance', 'sunhalo'], moon: ['eclipse', 'nightbloom'], wild: ['bramble', 'overgrow'] };
  // FLOWERS[area][nature]
  const FLOWERS = {
    sunflower: { name: 'Sunflower', area: 'meadow', nature: 'sun', el: 'light', sig: 'solarblast' },
    bluebell: { name: 'Bluebell', area: 'meadow', nature: 'moon', el: 'sky', sig: 'chimetoll' },
    daisy: { name: 'Daisy', area: 'meadow', nature: 'wild', el: 'leaf', sig: 'petalstorm' },
    hibiscus: { name: 'Hibiscus', area: 'beach', nature: 'sun', el: 'fire', sig: 'tropicburst' },
    sealily: { name: 'Sea Lily', area: 'beach', nature: 'moon', el: 'water', sig: 'tidebloom' },
    beachrose: { name: 'Beach Rose', area: 'beach', nature: 'wild', el: 'water', sig: 'thornsurf' },
    primrose: { name: 'Primrose', area: 'moonlit', nature: 'sun', el: 'light', sig: 'duskglow' },
    moonflower: { name: 'Moonflower', area: 'moonlit', nature: 'moon', el: 'shadow', sig: 'lunarbloom' },
    nightshade: { name: 'Nightshade', area: 'moonlit', nature: 'wild', el: 'shadow', sig: 'toxicpetal' },
    candytulip: { name: 'Candy Tulip', area: 'candy', nature: 'sun', el: 'sweet', sig: 'sugarbeam' },
    cottonrose: { name: 'Cotton Rose', area: 'candy', nature: 'moon', el: 'sweet', sig: 'fluffcloud' },
    sugarblossom: { name: 'Sugar Blossom', area: 'candy', nature: 'wild', el: 'sweet', sig: 'blossomblizzard' },
  };
  // stat that dominates at bloom gives a title: "Sunflower Glider"
  const STAT_TITLES = { swim: 'Diver', fly: 'Glider', run: 'Sprinter', power: 'Bruiser', stamina: 'Wanderer' };

  // ---------- Areas ----------
  const AREAS = {
    meadow: { name: 'Meadow', blurb: 'Grassy hills and a quiet lake.', theme: 'day', water: 'Lake' },
    beach: { name: 'Beach', blurb: 'Warm sand and open ocean.', theme: 'day', water: 'Ocean' },
    moonlit: { name: 'Moonlit Grove', blurb: 'Always twilight. Night creatures roam.', theme: 'night', water: 'Mirror Lake' },
    candy: { name: 'Candy Isle', blurb: 'Sugar hills and a soda sea.', theme: 'candy', water: 'Soda Sea' },
  };
  const AREA_ORDER = ['meadow', 'beach', 'moonlit', 'candy'];

  // ---------- Growth & economy (slow on purpose) ----------
  const GROWTH = {
    xpForLevel: lv => 20 + lv * 12,     // XP to go from lv to lv+1 (per stat)
    maxLevel: 50,
    partPerAbsorb: 0.34,
    pouchMax: 8,
    fruitRegrowSec: 90,
    dropEverySec: [55, 120],            // random coin / XP drops in the garden
    critterEverySec: [18, 35],
    critterLifeSec: 30,
    swimXpPerSec: 0.6,
    walkXpPerSec: 0.08,
    petHappy: 2,
  };
  const DROPS = {
    coin: { weight: 6, min: 2, max: 6 },          // multiplied by (1 + bestTier*0.5)
    bigcoin: { weight: 1, min: 12, max: 25 },
    xp: { weight: 4, min: 3, max: 7 },            // XP to a random stat of the Sprout that taps it (or the area's first)
  };
  const FRUITS = {
    apple: { name: 'Heart Apple', price: 8, gives: { stamina: 4 }, happy: 10, desc: 'Stamina and happiness.' },
    sunpear: { name: 'Sun Pear', price: 20, gives: { run: 2 }, nature: 10, desc: 'Pulls toward Sun.' },
    moonplum: { name: 'Moon Plum', price: 20, gives: { power: 2 }, nature: -10, desc: 'Pulls toward Moon.' },
    swiftberry: { name: 'Swift Berry', price: 30, gives: { run: 8 }, desc: 'Run XP.' },
    wingseed: { name: 'Wing Seed', price: 30, gives: { fly: 8 }, desc: 'Fly XP.' },
    seakelp: { name: 'Sea Kelp', price: 30, gives: { swim: 8 }, desc: 'Swim XP.' },
    powernut: { name: 'Power Nut', price: 30, gives: { power: 8 }, desc: 'Power XP.' },
    heartyroot: { name: 'Hearty Root', price: 30, gives: { stamina: 8 }, desc: 'Stamina XP.' },
    goldfruit: { name: 'Golden Fruit', price: 250, gives: { swim: 15, fly: 15, run: 15, power: 15, stamina: 15 }, happy: 20, desc: 'XP to every stat.' },
  };
  const TREE_FRUITS = ['apple', 'apple', 'apple', 'sunpear', 'moonplum'];

  // ---------- Races: 5 series x 3 tiers = 15 races ----------
  // mix: relative weight of segment types. rating: rival stat ratings (see state.raceRating). coins: 1st place prize.
  const RACE_TIERS = [
    { id: 0, name: 'Beginner', rating: [1.6, 2.6], coins: 30, xp: 10, cheerSkill: [0.12, 0.3, 0.15] },
    { id: 1, name: 'Pro', rating: [3.4, 5], coins: 110, xp: 22, cheerSkill: [0.28, 0.35, 0.08] },
    { id: 2, name: 'Master', rating: [6, 8], coins: 380, xp: 40, cheerSkill: [0.42, 0.3, 0.03] },
  ];
  const RACES = [
    { id: 'meadow', name: 'Meadow Dash', area: 'meadow', mix: { run: 5, swim: 1, climb: 1, fly: 1 }, length: 1100, unlock: null },
    { id: 'beach', name: 'Beach Relay', area: 'beach', mix: { run: 2, swim: 5, climb: 1, fly: 1 }, length: 1200, unlock: { race: 'meadow', tier: 0 } },
    { id: 'moonlit', name: 'Moonlit Glide', area: 'moonlit', mix: { run: 2, swim: 1, climb: 3, fly: 4 }, length: 1250, unlock: { race: 'beach', tier: 0 } },
    { id: 'candy', name: 'Candy Rally', area: 'candy', mix: { run: 3, swim: 2, climb: 3, fly: 2 }, length: 1300, unlock: { race: 'moonlit', tier: 0 } },
    { id: 'grand', name: 'Grand Prix', area: 'meadow', mix: { run: 3, swim: 3, climb: 3, fly: 3 }, length: 1700, unlock: { race: 'candy', tier: 1 } },
  ];
  const RACE_PLACE_SHARE = [1, 0.55, 0.3, 0.15]; // share of prize by place
  const RACE_STAT = { run: 'run', swim: 'swim', climb: 'power', fly: 'fly' };

  // ---------- Battle leagues: 6 leagues x 3 opponents ----------
  // Opponent: name, stage, nature, flower (stage 2), animals it absorbed, lv = target total stat level.
  const O = (name, lv, stage, nature, animals, flower, look) => ({ name, lv, stage, nature, animals, flower, look });
  const LEAGUES = [
    { id: 'pebble', name: 'Pebble League', coins: 20, xp: 8, egg: 'meadow', opponents: [
      O('Pip', 3, 0, 0, { hare: 1 }, null, { body: 'peach' }),
      O('Clover', 5, 0, 10, { bee: 1 }, null, { body: 'leaf' }),
      O('Bramble', 8, 0, -10, { ram: 2 }, null, { body: 'cocoa' }) ] },
    { id: 'thorn', name: 'Thorn League', coins: 50, xp: 14, egg: 'meadow', unlock: 'pebble', opponents: [
      O('Juniper', 12, 0, 20, { fox: 2, bee: 1 }, null, { body: 'clay' }),
      O('Sorrel', 16, 1, 30, { tortoise: 3 }, null, { body: 'sun' }),
      O('Thistle', 20, 1, -30, { owl: 3, fox: 1 }, null, { body: 'plum' }) ] },
    { id: 'tide', name: 'Tide League', coins: 110, xp: 22, egg: 'beach', unlock: 'thorn', opponents: [
      O('Marina', 22, 1, 10, { otter: 3, crab: 1 }, null, { body: 'sky' }),
      O('Coral', 26, 1, 40, { dolphin: 3, seal: 2 }, null, { body: 'rose' }),
      O('Brine', 30, 1, -40, { crab: 4, seaturtle: 2 }, null, { body: 'night' }) ] },
    { id: 'moon', name: 'Moon League', coins: 220, xp: 32, egg: 'moonlit', unlock: 'tide', opponents: [
      O('Nyx', 34, 1, -60, { bat: 4, wolf: 2 }, null, { body: 'night' }),
      O('Luna', 40, 2, -50, { moth: 4, jellyfish: 2 }, 'moonflower', { body: 'cloud' }),
      O('Umbra', 46, 2, 0, { wolf: 6, hedgehog: 3 }, 'nightshade', { body: 'slate' }) ] },
    { id: 'sugar', name: 'Sugar League', coins: 420, xp: 45, egg: 'candy', unlock: 'moon', opponents: [
      O('Taffy', 52, 2, 40, { gummybear: 5, sugarfinch: 3 }, 'candytulip', { body: 'rose' }),
      O('Fizz', 58, 2, 0, { sodafish: 6, jellyocto: 3 }, 'sugarblossom', { body: 'mint' }),
      O('Nougat', 60, 2, -40, { lollisnail: 6, cottonsheep: 2 }, 'cottonrose', { body: 'cocoa' }) ] },
    { id: 'legend', name: 'Legend League', coins: 900, xp: 70, egg: 'golden', unlock: 'sugar', opponents: [
      O('Aurora', 75, 2, 80, { phoenix: 1, dolphin: 6 }, 'sunflower', { body: 'sun' }),
      O('Tempest', 85, 2, -80, { griffin: 1, bat: 6 }, 'moonflower', { body: 'night' }),
      O('Wyrm', 100, 2, -20, { dragon: 1, dinosaur: 1 }, 'hibiscus', { body: 'berry' }) ] },
    // late game: 4 more leagues to grind through, ending with the Champion (a Sprout close to the max level of 250)
    { id: 'mythic', name: 'Mythic League', coins: 1000, xp: 75, egg: 'golden', unlock: 'legend', opponents: [
      O('Onyx', 112, 2, -60, { kitsune: 1, raccoon: 6 }, 'nightshade', { body: 'charcoal', pattern: 'mask', patternColor: '#c9a2f0' }),
      O('Seraphine', 122, 2, 70, { unicorn: 1, butterfly: 6 }, 'sunflower', { body: 'cream', hat: 'flower' }),
      O('Abyssa', 132, 2, -70, { kraken: 1, anglerfish: 6 }, 'sealily', { body: 'ocean', pattern: 'spots', patternColor: '#9fd8ff' }) ] },
    { id: 'starfall', name: 'Starfall League', coins: 1150, xp: 82, egg: 'crystal', unlock: 'mythic', opponents: [
      O('Comet', 146, 2, 50, { fairy: 1, moondeer: 6 }, 'primrose', { body: 'lilac', pattern: 'star', patternColor: '#fff27a' }),
      O('Nebula', 160, 2, -50, { phoenix: 1, pelican: 6 }, 'moonflower', { body: 'night', hat: 'wizard' }),
      O('Meteor', 166, 2, 0, { dinosaur: 1, pufferfish: 6 }, 'beachrose', { body: 'tangerine', pattern: 'freckles', patternColor: '#fbf3dc' }) ] },
    { id: 'titan', name: 'Titan League', coins: 1300, xp: 90, egg: 'rainbow', unlock: 'starfall', opponents: [
      O('Boulder', 188, 2, 10, { yeti: 1, squirrel: 6, frog: 3 }, 'daisy', { body: 'moss', hat: 'leafcap' }),
      O('Gale', 202, 2, -30, { griffin: 1, seahorse: 6, frog: 2 }, 'bluebell', { body: 'sky', pattern: 'stripes', patternColor: '#ffffff' }),
      O('Inferno', 208, 2, -10, { dragon: 1, chocomouse: 6, marshbunny: 3 }, 'hibiscus', { body: 'cherry', hat: 'tophat' }) ] },
    { id: 'champion', name: 'Champion League', coins: 1500, xp: 100, egg: 'dragon', unlock: 'titan', opponents: [
      O('Tsunami', 228, 2, -40, { kraken: 1, licoriceeel: 6, pufferfish: 3 }, 'sealily', { body: 'aqua', pattern: 'twotone', patternColor: '#ffffff' }),
      O('Aurelia', 238, 2, 90, { phoenix: 1, unicorn: 1, butterfly: 6 }, 'sunflower', { body: 'sun', extra: 'halo' }),
      O('Solara', 248, 2, 0, { dragon: 1, griffin: 1, moondeer: 6 }, 'candytulip', { body: 'bubblegum', hat: 'crown', eyes: 'sparkle' }) ] },
  ];
  const BATTLE = {
    hpBase: 40, hpPerStamina: 5, hpPerLevel: 1,
    atkBase: 12, atkPerPower: 2.2,
    defBase: 10, defPerStamina: 1.1, defPerSwim: 0.9,
    spdBase: 10, spdPerRun: 2,
    evaPerFly: 0.006, evaMax: 0.25,
    stab: 1.25, strong: 1.5, weak: 0.75, critBase: 0.06, critMult: 1.6,
    stageMult: [0.5, 0.6, 0.75, 1, 1.33, 1.66, 2], // index = stage + 3
    loseCoinsShare: 0.2,
  };

  // ---------- Eggs ----------
  // bodies: body colours a hatchling can have (PX.RAMPS ids). skin: special shimmering skin the hatchling always has.
  const EGGS = {
    meadow: { name: 'Meadow Egg', bodies: ['mint', 'leaf', 'peach', 'sky', 'lime', 'lemon', 'moss', 'teal'], taps: 5 },
    beach: { name: 'Beach Egg', bodies: ['sky', 'mint', 'sun', 'clay', 'coral', 'aqua', 'ocean', 'tangerine'], taps: 5 },
    moonlit: { name: 'Moonlit Egg', bodies: ['night', 'plum', 'slate', 'cloud', 'lilac', 'charcoal', 'ocean'], taps: 5 },
    candy: { name: 'Candy Egg', bodies: ['rose', 'berry', 'sun', 'plum', 'bubblegum', 'cherry', 'cream', 'tangerine'], taps: 5 },
    golden: { name: 'Golden Egg', bodies: ['sun', 'cloud', 'rose'], skin: 'gold', taps: 8, bonus: 60, sparkle: true, price: 1250, desc: 'Hatches a shiny gold Sprout with a head start in every stat.' },
    // rare eggs sold in the shop (golden above is also sold, and awarded for top-tier wins)
    rainbow: { name: 'Rainbow Egg', bodies: ['rose', 'sky', 'sun', 'plum', 'mint'], skin: 'rainbow', taps: 8, bonus: 30, sparkle: true, price: 2250, hatchWith: 'random', desc: 'Hatches a rainbow Sprout bonded with a random rare creature.' },
    crystal: { name: 'Crystal Egg', bodies: ['cloud', 'sky', 'plum'], skin: 'crystal', taps: 8, bonus: 45, sparkle: true, price: 3250, hatchWith: 'fairy', desc: 'Hatches a glittering crystal Sprout bonded with a Fairy.' },
    // Halloween eggs: spooky skins, sold in the shop and found in gumballs
    pumpkin: { name: 'Pumpkin Egg', bodies: ['tangerine', 'clay'], skin: 'pumpkin', taps: 6, bonus: 10, price: 600, spooky: true, desc: 'Hatches a jack-o\'-lantern Sprout with a glowing grin.' },
    ghost: { name: 'Ghost Egg', bodies: ['cloud', 'lilac'], skin: 'ghost', taps: 6, bonus: 10, price: 700, spooky: true, desc: 'Hatches a friendly see-through ghost Sprout. Boo!' },
    mummy: { name: 'Mummy Egg', bodies: ['cream', 'sun'], skin: 'mummy', taps: 6, bonus: 10, price: 700, spooky: true, desc: 'Hatches a Sprout wrapped up in bandages.' },
    candycorn: { name: 'Candy Corn Egg', bodies: ['lemon', 'tangerine'], skin: 'candycorn', taps: 6, bonus: 10, price: 600, spooky: true, desc: 'Hatches a stripy candy-corn Sprout.' },
    vampire: { name: 'Vampire Egg', bodies: ['charcoal', 'night'], skin: 'vampire', taps: 8, bonus: 20, price: 1100, spooky: true, hatchWith: 'bat', desc: 'Hatches a little vampire Sprout with bat wings.' },
    witch: { name: 'Witch Egg', bodies: ['plum', 'lime'], skin: 'witch', taps: 8, bonus: 20, price: 1200, spooky: true, hat: 'witch', desc: 'Hatches a magical witch Sprout, pointy hat included.' },
    dragon: { name: 'Dragon Egg', bodies: ['berry', 'clay', 'night'], skin: 'ember', taps: 10, bonus: 40, price: 4750, hatchWith: 'dragon', desc: 'Hatches a scaly ember Sprout bonded with a Dragon.' },
  };
  // special skins (from rare eggs)
  const SKINS = {
    gold: { name: 'Gold', from: 'golden' },
    rainbow: { name: 'Rainbow', from: 'rainbow' },
    crystal: { name: 'Crystal', from: 'crystal' },
    ember: { name: 'Ember', from: 'dragon' },
    pumpkin: { name: 'Pumpkin', from: 'pumpkin', spooky: true },
    ghost: { name: 'Ghost', from: 'ghost', spooky: true },
    mummy: { name: 'Mummy', from: 'mummy', spooky: true },
    candycorn: { name: 'Candy Corn', from: 'candycorn', spooky: true },
    vampire: { name: 'Vampire', from: 'vampire', spooky: true },
    witch: { name: 'Witch', from: 'witch', spooky: true },
  };

  // ---------- Looks: colours, patterns, hats (gumball prizes) ----------
  const COLORS = {
    mint: 'Mint', leaf: 'Leaf', sky: 'Sky', peach: 'Peach', rose: 'Rose', sun: 'Sunny', berry: 'Berry', plum: 'Plum', cloud: 'Cloud', slate: 'Slate',
    night: 'Night', clay: 'Clay', moss: 'Moss', cocoa: 'Cocoa', lilac: 'Lilac', teal: 'Teal', coral: 'Coral', lemon: 'Lemon', lime: 'Lime',
    ocean: 'Ocean', cherry: 'Cherry', cream: 'Cream', charcoal: 'Charcoal', tangerine: 'Tangerine', bubblegum: 'Bubblegum', aqua: 'Aqua',
  };
  const PATTERNS = { plain: 'Plain', spots: 'Spots', stripes: 'Stripes', twotone: 'Two-tone', mask: 'Mask', star: 'Belly star', freckles: 'Freckles', heart: 'Heart', socks: 'Socks' };
  const PATTERN_COLORS = ['#fbf3dc', '#ffffff', '#fff27a', '#f7b6c8', '#c9a2f0', '#9fd8ff', '#a6f2d3', '#f5a86a'];
  // hats (slot 'hat') and accessories (slot 'extra'): once won they belong to the player; any Sprout can wear them
  const HATS = {
    bow: { name: 'Bow', slot: 'hat', tier: 1 }, flower: { name: 'Flower clip', slot: 'hat', tier: 1 }, leafcap: { name: 'Leaf cap', slot: 'hat', tier: 1 },
    beanie: { name: 'Beanie', slot: 'hat', tier: 1 }, cap: { name: 'Cap', slot: 'hat', tier: 1 }, party: { name: 'Party hat', slot: 'hat', tier: 1 },
    sunhat: { name: 'Sun hat', slot: 'hat', tier: 2 }, tophat: { name: 'Top hat', slot: 'hat', tier: 2 }, wizard: { name: 'Wizard hat', slot: 'hat', tier: 2 },
    witch: { name: 'Witch hat', slot: 'hat', tier: 2 }, crown: { name: 'Crown', slot: 'hat', tier: 3 }, star: { name: 'Star sparkle', slot: 'extra', tier: 2 }, moon: { name: 'Moon charm', slot: 'extra', tier: 2 },
    halo: { name: 'Halo', slot: 'extra', tier: 3 },
  };

  // ---------- Gumball machine ----------
  // price per gumball. prizes: [type, weight]. Prize types are handled in state.gumball().
  const GUMBALL = {
    small: { name: 'Gumball', price: 25, prizes: [['coins', 20], ['fruit', 24], ['goldfruit', 2], ['paint', 20], ['pattern', 12], ['hat', 10], ['animal', 8], ['egg', 2], ['spookyegg', 1], ['goldenegg', 0.25], ['rare', 0.15]], coins: [8, 40] },
    mega: { name: 'Mega gumball', price: 150, prizes: [['coins', 14], ['goldfruit', 10], ['paint', 14], ['pattern', 8], ['hat', 20], ['animal', 10], ['egg', 10], ['spookyegg', 6], ['goldenegg', 3], ['rainbowegg', 1], ['rare', 2]], coins: [60, 240] },
  };
  // selling a Sprout: base + per total level + per stage, plus a share of any rare creatures it was bonded with
  const SELL = { base: 20, perLevel: 6, stage: [0, 100, 400], rareShare: 0.3, skin: 300 };
  const MAX_PARTS = 4; // a Sprout shows at most this many animal body parts; the oldest drops off when a new one grows
  const SHOP_EGGS = ['golden', 'rainbow', 'crystal', 'dragon', 'pumpkin', 'candycorn', 'ghost', 'mummy', 'vampire', 'witch'];
  const SPOOKY_EGGS = ['pumpkin', 'ghost', 'mummy', 'candycorn', 'vampire', 'witch'];
  const NAMES = ['Nib', 'Clover', 'Bramble', 'Pebble', 'Juniper', 'Sorrel', 'Tansy', 'Wren', 'Moss', 'Fennel', 'Poppy', 'Nimbus', 'Basil', 'Olive', 'Pip', 'Sage', 'Ivy', 'Rowan', 'Hazel', 'Minnow', 'Pudding', 'Maple', 'Kelp', 'Dewdrop'];

  const PART_NAMES = { wings: 'Wings', ears: 'Long ears', fins: 'Fins', horns: 'Horns', tail: 'Tail', shell: 'Shell', antennae: 'Antennae', claws: 'Claws',
    spikes: 'Spikes', unihorn: 'Unicorn horn', fairywings: 'Fairy wings', flamewings: 'Flame wings', batwings: 'Bat wings', dragonwings: 'Dragon wings',
    fluff: 'Fluff', tentacles: 'Tentacles', multitail: 'Nine tails', spots: 'Star spots',
    petals: 'Petal collar', mushcap: 'Mushroom cap', leafears: 'Leaf ears', vines: 'Vines', thorns: 'Thorns' };

  // ---------- Day / night ----------
  const CLOCK = { phaseMinutes: 15, fadeSeconds: 45 }; // switches every 15 real minutes

  window.PSDATA = { STATS, STAT_META, ELEMENTS, MOVES, ANIMALS, RARES, EVO, FORMS, BLOOM_POOL, FLOWERS, STAT_TITLES, AREAS, AREA_ORDER,
    GROWTH, DROPS, FRUITS, TREE_FRUITS, RACE_TIERS, RACES, RACE_PLACE_SHARE, RACE_STAT, LEAGUES, BATTLE, EGGS, SHOP_EGGS, SPOOKY_EGGS, NAMES, CLOCK, PART_NAMES,
    SKINS, COLORS, PATTERNS, PATTERN_COLORS, HATS, GUMBALL, SELL, MAX_PARTS };
})();
