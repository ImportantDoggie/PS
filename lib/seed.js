'use strict';

const A = (name, kind, ext) => `/assets/${name}-${kind}.${ext || (kind === 'logo' ? 'png' : 'jpg')}`;

function base(id, name, opts = {}) {
  return {
    id,
    name,
    sortName: name.toLowerCase().replace(/^(the|a|an)\s+/i, ''),
    source: 'steam',
    appId: null,
    installDir: '',
    exePath: '',
    launchUri: '',
    args: '',
    installed: true,
    favorite: false,
    hidden: false,
    playtimeSeconds: 0,
    lastPlayed: null,
    addedAt: Date.now() - 86400000 * 30,
    releaseYear: null,
    platform: 'PC (Windows)',
    cover: '',
    hero: '',
    logo: '',
    description: '',
    genres: [],
    developers: [],
    publishers: [],
    cloud: false,
    order: 0,
    ...opts
  };
}

function seedGames() {
  const g = [];
  const add = (id, name, o) => { const x = base(id, name, o); x.order = g.length; g.push(x); return x; };

  add('prank', "[Bober Bros] It's Just A Prank", {
    appId: 3001730, favorite: true, releaseYear: 2024, cloud: true,
    cover: A('prank', 'cover'), hero: A('prank', 'hero'), logo: A('prank', 'logo'),
    playtimeSeconds: 3600 * 2 + 14 * 60, lastPlayed: Date.now() - 86400000 * 2,
    genres: ['Horror', 'Indie'], developers: ['Bober Bros'], description: 'Короткий психологический хоррор о безобидной шутке, которая зашла слишком далеко.'
  });
  add('hole', '[Bober Bros] The Hole', {
    appId: 3037930, favorite: true, releaseYear: 2025, cloud: true,
    cover: A('hole', 'cover'), hero: A('hole', 'hero'), logo: A('hole', 'logo'),
    playtimeSeconds: 3600 + 42 * 60, lastPlayed: Date.now() - 86400000 * 5,
    genres: ['Horror', 'Indie'], developers: ['Bober Bros'], description: 'Что-то смотрит на тебя из дыры. Не смотри в ответ.'
  });
  add('35mm', '35MM', {
    appId: 466500, favorite: true, releaseYear: 2016, cloud: true,
    cover: A('35mm', 'cover'), hero: A('35mm', 'hero'), logo: A('35mm', 'logo'),
    playtimeSeconds: 3600 * 5 + 8 * 60, lastPlayed: Date.now() - 86400000 * 9,
    genres: ['Adventure', 'Indie'], developers: ['Носков Сергей'], description: 'Постсоветская дорога, туман и два путника. Атмосферное приключение о пустоте и памятье.'
  });
  add('plague', 'A Plague Tale: Innocence', {
    appId: 752590, favorite: true, releaseYear: 2019, cloud: true, installed: false,
    cover: A('plague', 'cover'), hero: '/assets/plague-bg.jpg', logo: '/assets/plague-logo-white.png',
    playtimeSeconds: 0, lastPlayed: null,
    genres: ['Action', 'Adventure', 'Stealth'], developers: ['Asobo Studio'], publishers: ['Focus Entertainment'],
    description: '1349 год. Чума опустошает Францию. Амиция и её младший брат Гуго бегут от Инквизиции и орд крыс, несущих чёрную смерть.'
  });
  add('afterfall', 'Afterfall InSanity Extended Edition', {
    appId: 224420, favorite: true, releaseYear: 2012, cloud: false,
    cover: '/assets/afterfall-sg-8734c5.png', hero: '/assets/afterfall-hero-sg.png', logo: '/assets/afterfall-logo-sg.png',
    playtimeSeconds: 3600 * 3 + 25 * 60, lastPlayed: Date.now() - 86400000 * 21,
    genres: ['Horror', 'Action'], developers: ['Intoxicate Studios'], description: 'Постапокалиптический хоррор в бункерах и руинах. Темнота, безумие и то, что осталось от человечества.'
  });
  add('alanwake', 'Alan Wake', {
    appId: 108710, favorite: true, releaseYear: 2012, cloud: true,
    cover: A('alanwake', 'cover'), hero: A('alanwake', 'hero'), logo: A('alanwake', 'logo'),
    playtimeSeconds: 3600 * 11 + 47 * 60, lastPlayed: Date.now() - 86400000 * 1,
    genres: ['Action', 'Thriller'], developers: ['Remedy Entertainment'], description: 'Писатель Алан Уэйк ищет пропавшую жену в городке, где его рукопись оживает — и убивает.'
  });
  add('american-nightmare', "Alan Wake's American Nightmare", {
    appId: 202750, favorite: true, releaseYear: 2012, cloud: true,
    cover: A('american-nightmare', 'cover'), hero: A('american-nightmare', 'hero'), logo: A('american-nightmare', 'logo'),
    playtimeSeconds: 3600 * 4 + 3 * 60, lastPlayed: Date.now() - 86400000 * 14,
    genres: ['Action'], developers: ['Remedy Entertainment'], description: 'Алан Уэйк против своего злого двойника в петле времени, залитой солнцем Аризоны.'
  });
  add('alien', 'Alien: Isolation', {
    appId: 214490, favorite: true, releaseYear: 2014, cloud: true,
    cover: A('alien', 'cover'), hero: A('alien', 'hero'), logo: A('alien', 'logo'),
    playtimeSeconds: 3600 * 23 + 12 * 60, lastPlayed: Date.now() - 86400000 * 3,
    genres: ['Horror', 'Survival'], developers: ['Creative Assembly'], publishers: ['SEGA'], description: 'Станция «Севастополь». Один ксеноморф. Никакого оружия. Только тишина, датчик движения и твоё дыхание.'
  });
  add('amnesia', 'Amnesia: The Bunker', {
    appId: 1944430, favorite: true, releaseYear: 2023, cloud: true,
    cover: A('amnesia', 'cover'), hero: A('amnesia', 'hero'), logo: A('amnesia', 'logo'),
    playtimeSeconds: 3600 * 7 + 58 * 60, lastPlayed: Date.now() - 86400000 * 6,
    genres: ['Horror', 'Immersive Sim'], developers: ['Frictional Games'], description: 'Французский бункер Первой мировой. Генератор, динамо-фонарь и существо, которое слышит каждый твой шаг.'
  });
  add('requiem', 'A Plague Tale: Requiem', {
    appId: 1182900, favorite: true, releaseYear: 2022, cloud: true,
    cover: A('requiem', 'cover'), hero: A('requiem', 'hero'), logo: A('requiem', 'logo'),
    playtimeSeconds: 3600 * 16 + 20 * 60, lastPlayed: Date.now() - 86400000 * 4,
    genres: ['Action', 'Adventure'], developers: ['Asobo Studio'], publishers: ['Focus Entertainment'], description: 'Амиция и Гуго идут на юг, к острову, где, возможно, есть лекарство. Чума идёт за ними.'
  });

  // Non-favorite library entries
  add('control', 'Control Ultimate Edition', {
    appId: 870780, releaseYear: 2020, cloud: true,
    cover: A('control', 'cover'), hero: A('control', 'hero'), logo: A('control', 'logo'),
    playtimeSeconds: 3600 * 9 + 11 * 60, lastPlayed: Date.now() - 86400000 * 11,
    genres: ['Action', 'Metroidvania'], developers: ['Remedy Entertainment'], description: 'Старейший Дом. Федеральное Бюро Контроля. Джесси Фейден и меняющиеся коридоры власти.'
  });
  add('hellblade', "Hellblade: Senua's Sacrifice", {
    appId: 414340, releaseYear: 2017, cloud: true,
    cover: A('hellblade', 'cover'), hero: A('hellblade', 'hero'), logo: A('hellblade', 'logo'),
    playtimeSeconds: 3600 * 6 + 44 * 60, lastPlayed: Date.now() - 86400000 * 30,
    genres: ['Action', 'Adventure'], developers: ['Ninja Theory'], description: 'Кельтская воительница идёт в Хельхейм, чтобы вернуть душу возлюбленного. Голоса не замолкают.'
  });
  add('metro', 'Metro Exodus', {
    appId: 412020, releaseYear: 2019, cloud: true,
    cover: A('metro', 'cover'), hero: A('metro', 'hero'), logo: A('metro', 'logo'),
    playtimeSeconds: 3600 * 19 + 2 * 60, lastPlayed: Date.now() - 86400000 * 8,
    genres: ['FPS', 'Survival'], developers: ['4A Games'], description: 'Артём и «Аврора» покидают Москву. Год в пути через постапокалиптическую Россию.'
  });
  add('death', 'Death Stranding', {
    appId: 1190460, releaseYear: 2020, cloud: true,
    cover: A('death', 'cover'), hero: A('death', 'hero'), logo: A('death', 'logo'),
    playtimeSeconds: 3600 * 31 + 40 * 60, lastPlayed: Date.now() - 86400000 * 17,
    genres: ['Action', 'Open World'], developers: ['Kojima Productions'], description: 'Сэм Портер Бриджес соединяет разорванную Америку. Груз, дождь, BT и надежда.'
  });
  add('re2', 'Resident Evil 2', {
    appId: 883710, releaseYear: 2019, cloud: true,
    cover: A('re2', 'cover'), hero: A('re2', 'hero'), logo: A('re2', 'logo'),
    playtimeSeconds: 3600 * 12 + 9 * 60, lastPlayed: Date.now() - 86400000 * 12,
    genres: ['Horror', 'Survival'], developers: ['CAPCOM'], description: 'Раккун-Сити. Леон Кеннеди и Клэр Редфилд. Полицейский участок, который больше не защищает.'
  });

  return g;
}

function seedState() {
  return {
    games: seedGames(),
    settings: {
      scanSources: { steam: true, epic: true, gog: true, ea: true, ubisoft: true, battlenet: true, xbox: true, itch: true, shortcuts: true, registry: true, folders: true },
      customFolders: [],
      scanOnStartup: true,
      startWithWindows: false,
      minimizeToTray: true,
      fullscreen: true,
      sound: true,
      trackPlaytime: true,
      showClock: true,
      language: 'ru'
    },
    views: [
      { id: 'v-fav', name: 'Избранное', tab: 'favorites', search: '', filter: { source: 'all', installed: 'all', genre: 'all' }, sort: 'manual' }
    ],
    notifications: [
      { id: 'n1', type: 'info', title: 'Библиотека обновлена', body: 'Найдено 15 игр. Обложки и фоны загружены.', ts: Date.now() - 3600000, read: false },
      { id: 'n2', type: 'success', title: 'Сессия сохранена', body: 'Alan Wake — 1 ч 24 мин добавлено ко времени в игре.', ts: Date.now() - 86400000, read: false }
    ],
    sessions: []
  };
}

module.exports = { seedGames, seedState, base };
