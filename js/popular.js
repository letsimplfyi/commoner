// A short, hand-picked starting list so nobody lands on an empty box. Commons has no popularity ranking.
// Every entry was checked to exist with photos in it (npm run popular:check re-checks them against Commons).
export const POPULAR = [
  { title: 'Start here', items: ['Featured pictures on Wikimedia Commons', 'Quality images', 'Media of the day', 'Valued images'] },
  { title: 'Nature', items: ['Sunsets', 'Mountains', 'Rivers', 'Waterfalls', 'Night photography', 'Flowers'] },
  { title: 'Places and things', items: ['Street art', 'Bridges', 'Temples in India', 'Food', 'Cats', 'Black and white photographs'] },
  { title: 'Nepal', items: ['Kathmandu', 'Thamel', 'Swayambhunath', 'Prayer flags in Nepal', 'Featured pictures of Nepal'] },
];
export const allPopular = () => POPULAR.flatMap(group => group.items);
export const randomCategory = (random = Math.random) => { const all = allPopular(); return all[Math.floor(random() * all.length)]; };
