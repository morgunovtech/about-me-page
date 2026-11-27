// Code-side fixes for content stored in KV. A doc saved to KV keeps winning
// over `content.seed.json`, so a copy fix made in code reaches the live page
// only through this table — until the next /admin Save persists the fixed
// text, after which the entry is dead and gets removed.
//
// On 2026-11-09 (v1.0.1) the home and about docs were saved with every earlier
// swap and read-time migration applied (`migration: 31` in the doc), and those
// swaps and migrations were removed. On 2026-11-25 (v4.0.1) the home doc was
// saved again through /admin (rev 34) with the entries of v1.5.0, v2.0.0 and
// v2.2.1 and the seed fill of v2.2.3 applied, and both tables were emptied
// again (the about doc went with v4.0.0). Their history is in git.
//
// Rules for a new entry: a pure string (or /g regex) swap, idempotent — a
// second pass must change nothing, so anchor a whole-field swap with ^…$ when
// the new text contains the old one — and check it against the live KV doc
// (`npx wrangler kv key get … --remote`), not a screenshot: owner text holds
// NBSPs. A change to a doc's shape needs a read-time migration instead.
//
// No imports on purpose: Node tests load this file directly.

// v4.9.2 (owner, 2026-11-27): the reply time is 7 working days, not 10 (home
// «Связаться», /consulting), and the home contact note drops «или e-com». Regexes,
// so a no-break space or hyphen the owner's text may hold still matches; each
// swap is idempotent (its result no longer matches). Remove the entries once a
// Save of home and consulting has stored the new text.
const STALE = [
  [/(?<![\d])10([ \u00a0])рабочих дней/g, '7$1рабочих дней'],
  [/(?<![\d])10([ \u00a0])business days/g, '7$1business days'],
  [/на продукт([ \u00a0])или e[-\u2011]com или хотите/g, 'на продукт$1или хотите'],
  [/on a product or e[-\u2011]com, or want/g, 'on a product, or want'],
  // v4.10.1 (owner, 2026-11-27): TofsDevOps' card opens with what it is and for whom, not
  // «Сам себе DevOps в Telegram» — the card's «Telegram-бот» label says the rest. The RU text
  // is the bot README's new lead (sync-products.mjs reads it); the EN one its repo description.
  [/Сам[ \u00a0]себе[ \u00a0]DevOps[ \u00a0]в[ \u00a0]Telegram\./g, 'Мониторинг сайтов для тех, кто не знает, что такое DNS и ошибка 502.'],
  [/Your personal DevOps in Telegram\./g, 'Website monitoring for people who have never heard of DNS or a 502.'],
  // v4.10.3 (owner, 2026-11-27): the homepage pass. «Сервисы», not «инструменты» (the hero,
  // /collaborate); the follows stat counts follows, not people; «years in tech»; the current role
  // says what he builds; the two superlatives nobody could check now name a source and say what
  // it says (Korzinka: the EBRD's «Uzbekistan's leading food retailer»; Skyeng: third by revenue in
  // Smart Ranking 2025); no «(ATH)»; the bullets lead with their subject; «Яндекс Услуги» in
  // Russian; the About keeps the channel and Tofs; «публикацию», not «пост»; «Свои проекты»,
  // and the past ventures under them are «Ранние проекты» (the stat counts all eight as projects).
  [/рынках,[ \u00a0]делаю[ \u00a0]инструменты[ \u00a0]про[ \u00a0]приватность/g, 'рынках, разрабатываю open source сервисы'],
  [/make privacy tools/g, 'develop open source services'],
  [/разрабатываю[ \u00a0]open[ \u00a0]source[ \u00a0]инструменты/g, 'разрабатываю open source сервисы'],
  [/build open source tools/g, 'build open source services'],
  [/^подписчиков$/g, 'подписок'],
  [/^followers$/g, 'follows'],
  [/^yrs in tech$/g, 'years in tech'],
  [/BNPL,[ \u00a0]платежи,[ \u00a0]кредитные[ \u00a0]продукты\.[ \u00a0]Строю[ \u00a0]и[ \u00a0]масштабирую[ \u00a0]продуктовые[ \u00a0]линейки\./g, 'Развиваю BNPL-сервис «Сплит», строю кредитного брокера в приложениях Go и Pro; участвую в оптимизации платёжной инфраструктуры экосистемы в Узбекистане.'],
  [/BNPL, payments, credit products\. Building and scaling product lines\./g, 'Developing the BNPL service Split, building a credit broker in the Go and Pro apps; helping optimise the ecosystem’s payment infrastructure in Uzbekistan.'],
  [/отвечал[ \u00a0]за[ \u00a0]P&L[ \u00a0]в[ \u00a0]крупнейшем[ \u00a0]e[-\u2011]grocery[ \u00a0]Узбекистана\./g, 'отвечал за P&L\u00a0онлайн-супермаркета [ведущей продуктовой сети Узбекистана](https://www.ebrd.com/home/news-and-events/news/2025/ebrd-welcomes-major-investment-in-uzbek-food-retailer-.html).'],
  [/owned the full P&L at Uzbekistan['’]s largest e[-\u2011]grocery\./g, 'owned the full P&L of the online supermarket of [Uzbekistan\'s leading food retailer](https://www.ebrd.com/home/news-and-events/news/2025/ebrd-welcomes-major-investment-in-uzbek-food-retailer-.html).'],
  [/[ \u00a0]\(ATH\)/g, ''],
  [/Мероприятия:[ \u00a0]100\+[ \u00a0]событий[ \u00a0]в[ \u00a0]online[ \u00a0]\/[ \u00a0]offline[ \u00a0]\/[ \u00a0]blended[-\u2011]форматах/g, 'Мероприятия: 100+ событий онлайн, офлайн и в смешанном формате'],
  [/Events: 100\+ online \/ offline \/ blended[-\u2011]format sessions/g, 'Events: 100+ sessions online, offline and blended'],
  [/Сертификация[ \u00a0]Apple[ \u00a0]Expert:[ \u00a0]92%[ \u00a0]подопечных[ \u00a0]получили[ \u00a0]международный[ \u00a0]сертификат/g, 'Apple Expert: международный сертификат получили 92% подопечных'],
  [/Apple Expert Certification: 92% of trainees obtained the international certificate/g, 'Apple Expert: 92% of trainees earned the international certificate'],
  [/в[ \u00a0]\*\*Yandex[ \u00a0]Uslugi\*\*/g, 'в **Яндекс Услугах**'],
  [/\[Yandex[ \u00a0]Uslugi\]\(/g, '[Яндекс Услуги]('],
  [/Крупнейшая[ \u00a0]EdTech[-\u2011]компания[ \u00a0]Восточной[ \u00a0]Европы\./g, '[Одна из трёх крупнейших EdTech-компаний России](https://skillbox.ru/media/edtech/v-2025-godu-rossiyskiy-edtech-vyros-vsego-na-12/) по выручке.'],
  [/Largest EdTech company in Eastern Europe\./g, '[One of Russia\'s three largest EdTech companies](https://skillbox.ru/media/edtech/v-2025-godu-rossiyskiy-edtech-vyros-vsego-na-12/) by revenue.'],
  [/Активировал[ \u00a0]7[ \u00a0]млн\+[ \u00a0]пользователей/g, 'Активация: 7\u00a0млн+ пользователей'],
  [/Запустил[ \u00a0]продукты,[ \u00a0]которые[ \u00a0]вошли[ \u00a0]в[ \u00a0]топ[-\u2011]3[ \u00a0]каналов[ \u00a0]привлечения[ \u00a0]пользователей[ \u00a0]с[ \u00a0]положительной[ \u00a0]юнит[-\u2011]экономикой/g, 'Каналы привлечения: запустил продукты, вошедшие в топ-3 каналов с положительной юнит-экономикой'],
  [/Activated 7M\+ users/g, 'Activation: 7M+ users'],
  [/Launched products that became top[-\u2011]3 user acquisition channels with positive unit economics/g, 'Acquisition channels: launched products that became top-3 channels with positive unit economics'],
  [/С[ \u00a0]2009[ \u00a0]года[ \u00a0]запустил[^\n]*?открытым[ \u00a0]кодом\.[ \u00a0](?=Веду)/g, ''],
  [/Since 2009 I['’]ve launched[^\n]*?open source\.[ \u00a0](?=I run)/g, ''],
  [/обсудить[ \u00a0]пост\./g, 'обсудить публикацию.'],
  [/discuss a post\./g, 'discuss a publication.'],
  [/^Собственные[ \u00a0]проекты$/g, 'Свои проекты'],
  [/^До[ \u00a0]этого$/g, 'Ранние проекты'],
  [/^Before$/g, 'Earlier projects'],
  [/руководил[ \u00a0]крупнейшим[ \u00a0]e[-\u2011]grocery[ \u00a0]в[ \u00a0]Узбекистане[ \u00a0]в[ \u00a0]\*\*Korzinka\*\*/g, 'руководил онлайн-супермаркетом **Korzinka**, [ведущей продуктовой сети Узбекистана](https://www.ebrd.com/home/news-and-events/news/2025/ebrd-welcomes-major-investment-in-uzbek-food-retailer-.html)'],
  [/3 years leading the largest e[-\u2011]grocery in Uzbekistan at \*\*Korzinka\*\*/g, '3 years leading the online supermarket of **Korzinka**, [Uzbekistan\'s leading food retailer](https://www.ebrd.com/home/news-and-events/news/2025/ebrd-welcomes-major-investment-in-uzbek-food-retailer-.html)'],
];

export function fixStaleContent(node) {
  if (!STALE.length) return node;
  if (Array.isArray(node)) {
    node.forEach(fixStaleContent);
    return node;
  }
  if (!node || typeof node !== 'object') return node;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const fixed = STALE.reduce((s, [from, to]) => s.replaceAll(from, to), v);
      if (fixed !== v) node[k] = fixed;
    } else fixStaleContent(v);
  }
  return node;
}

// Fields a renderer reads that a KV doc saved before they existed may lack:
// the seed supplies them, only when missing — never over what the owner saved —
// until the next /admin Save stores them with the doc. v2.2.2 moved the
// homepage /privacy link from the template into the products renderer, and
// the home doc in KV (rev 33) had no `sections.products.privacy`: the link
// vanished from the live page until v2.2.3 filled it here. The rev 34 Save
// (v4.0.1) stored it. v4.7.0 filled `stats.2.channels.instagram` (Instagram,
// a new channel of the subscribers stat) until `kv-push.mjs home` stored it
// with the doc (rev 42, 2026-11-27), so the table is empty again. An entry is
// { page: ['a.b.c'] }.
// v4.10.2: «10 лет в IT» links the career (`stats.0.href`, as «8 своих проектов» links the
// projects since v4.6.0); the home doc in KV has no href on its first stat.
export const SEED_FILL = { home: ['stats.0.href'] };

export function fillFromSeed(doc, page, from, table = SEED_FILL) {
  const paths = table[page];
  const src = from && from[page];
  if (!doc || !paths || !src || doc === src) return doc;
  for (const path of paths) {
    const keys = path.split('.');
    const value = keys.reduce((o, k) => (o == null ? undefined : o[k]), src);
    if (value === undefined) continue;
    let node = doc;
    for (const k of keys.slice(0, -1)) {
      if (node[k] == null || typeof node[k] !== 'object') { node = null; break; }
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (node && node[last] === undefined) node[last] = JSON.parse(JSON.stringify(value));
  }
  return doc;
}
