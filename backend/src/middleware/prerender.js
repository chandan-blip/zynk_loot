const SITE_URL = process.env.SITE_URL || 'https://lootmarket.store';
const SITE_NAME = 'LOOT Market';

const pageMeta = {
  '/': {
    title: 'LOOT Market - Win Big with Numbers, Play Instant Games & Earn Rewards',
    description: 'LOOT Market is the ultimate number-based prize platform. Buy lucky numbers, play 9+ instant games like Coin Flip, Dragon Tower & Balloon Pop, invest for daily returns, and win real prizes every day.',
  },
  '/games': {
    title: 'Instant Games | LOOT Market',
    description: 'Play 9+ instant games including Coin Flip, Dice Roll, Lucky Spin, Balloon Pop, Dragon Tower, Ice Field, Arrow Roulette, Egg Hatch, and Fuse. Win real prizes instantly!',
  },
  '/games/coin-flip': {
    title: 'Coin Flip | LOOT Market',
    description: 'Play Coin Flip on LOOT Market. Pick heads or tails and double your bet instantly!',
  },
  '/games/dice-roll': {
    title: 'Dice Roll | LOOT Market',
    description: 'Play Dice Roll on LOOT Market. Predict the outcome and win big rewards!',
  },
  '/games/lucky-spin': {
    title: 'Lucky Spin | LOOT Market',
    description: 'Spin the wheel on LOOT Market and win amazing prizes with Lucky Spin!',
  },
  '/games/balloon-pop': {
    title: 'Balloon Pop | LOOT Market',
    description: 'Pop balloons and win prizes on LOOT Market. How far can you go before it bursts?',
  },
  '/games/dragon-tower': {
    title: 'Dragon Tower | LOOT Market',
    description: 'Climb the Dragon Tower on LOOT Market. Each floor multiplies your winnings!',
  },
  '/games/ice-field': {
    title: 'Ice Field | LOOT Market',
    description: 'Navigate the Ice Field on LOOT Market. Pick safe tiles and multiply your bet!',
  },
  '/games/arrow-roulette': {
    title: 'Arrow Roulette | LOOT Market',
    description: 'Play Arrow Roulette on LOOT Market. Spin and win with multiplied rewards!',
  },
  '/games/egg-hatch': {
    title: 'Egg Hatch | LOOT Market',
    description: 'Hatch eggs and discover prizes on LOOT Market. Every egg holds a surprise!',
  },
  '/games/fuse': {
    title: 'Fuse | LOOT Market',
    description: 'Play Fuse on LOOT Market. Light the fuse and cash out before it blows!',
  },
  '/invest': {
    title: 'Invest | LOOT Market',
    description: 'Invest on LOOT Market and earn daily returns. Multiple plans available with guaranteed returns.',
  },
  '/leaderboard': {
    title: 'Leaderboard | LOOT Market',
    description: 'See the top winners on LOOT Market. Check the leaderboard and compete for the top spot!',
  },
  '/faq': {
    title: 'FAQ | LOOT Market',
    description: 'Frequently asked questions about LOOT Market. Learn how to play, win, and withdraw your prizes.',
  },
  '/rules': {
    title: 'Rules | LOOT Market',
    description: 'Read the rules and guidelines for playing on LOOT Market. Fair play guaranteed.',
  },
  '/privacy': {
    title: 'Privacy Policy | LOOT Market',
    description: 'LOOT Market privacy policy. Learn how we protect your data and respect your privacy.',
  },
  '/terms': {
    title: 'Terms of Service | LOOT Market',
    description: 'LOOT Market terms of service. Read our terms and conditions.',
  },
  '/contact': {
    title: 'Contact Us | LOOT Market',
    description: 'Get in touch with LOOT Market support. We are available 24/7 via email and live chat.',
  },
  '/about': {
    title: 'About Us | LOOT Market',
    description: 'Learn about LOOT Market — the ultimate number-based prize platform with instant games and daily rewards.',
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming | LOOT Market',
    description: 'LOOT Market is committed to responsible gaming. Learn about our tools and resources.',
  },
  '/security': {
    title: 'Security | LOOT Market',
    description: 'Learn about LOOT Market security measures. Your safety and data protection is our priority.',
  },
  '/login': {
    title: 'Login | LOOT Market',
    description: 'Log in to your LOOT Market account to play games, buy numbers, and win prizes.',
  },
  '/register': {
    title: 'Register | LOOT Market',
    description: 'Create your LOOT Market account and start winning today. Join thousands of players!',
  },
};

const defaultMeta = {
  title: 'LOOT Market - Win Big with Numbers & Instant Games',
  description: 'Buy lucky numbers, play instant games, and win real prizes daily on LOOT Market.',
};

const CRAWLER_USER_AGENTS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'WhatsApp',
  'TelegramBot', 'LinkedInBot', 'Slackbot', 'Discordbot',
  'Pinterest', 'Embedly', 'Iframely', 'vkShare', 'Viber',
  'Line', 'SkypeUriPreview',
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  return CRAWLER_USER_AGENTS.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMeta(path) {
  const meta = pageMeta[path] || defaultMeta;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const imageUrl = SITE_URL + '/og-image.png';
  const pageUrl = SITE_URL + path;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:locale" content="en_US" />
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="${escapeHtml(pageUrl)}" />
  <meta property="twitter:title" content="${title}" />
  <meta property="twitter:description" content="${description}" />
  <meta property="twitter:image" content="${escapeHtml(imageUrl)}" />
  <link rel="icon" type="image/svg+xml" href="${SITE_URL}/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="${SITE_URL}/favicon-32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="${SITE_URL}/apple-touch-icon.png" />
  <link rel="manifest" href="${SITE_URL}/manifest.json" />
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
</body>
</html>`;
}

function prerenderMiddleware(req, res) {
  // Extract the page path from /api/og/PATH
  const pagePath = req.path.replace(/^\/api\/og/, '') || '/';
  const cleanPath = pagePath.replace(/\/+$/, '') || '/';
  res.set('Content-Type', 'text/html');
  res.send(renderMeta(cleanPath));
}

module.exports = prerenderMiddleware;
