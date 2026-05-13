const en: Record<string, string> = {
  // Hero top buttons
  'hero.apiLogin': 'API LOGIN',
  'hero.apiDocs': 'API DOCS',
  'hero.docsMobile': 'DOCS',
  'hero.officialDocs': 'OFFICIAL DOCS',
  'hero.launchApp': 'LAUNCH APP',
  'hero.comingSoon': 'Coming Soon!',

  // Hero subtitle
  'hero.subtitle': "BITCOIN'S NEXT-GEN DEFI EXPERIENCE",

  // Hero action button
  'hero.volumeCharts': 'VOLUME CHARTS',

  // Scroll arrow label
  'hero.learnMore': 'Learn More',

  // StickyNav
  'nav.assets': 'Assets',
  'nav.app': 'App',
  'nav.teamPartners': 'Team',
  'nav.docs': 'Docs',
  'nav.apiLogin': 'API Login',

  // Metrics
  'metrics.currentFrbtcSupply': 'Current\nfrBTC Supply',
  'metrics.totalBtcLocked': 'Total\nBTC Locked',
  'metrics.lifetimeTxValue': 'Lifetime\nTx Value',
  'metrics.breakdown': 'Breakdown',
  'metrics.verify': 'Verify',
  'metrics.btcPrice': 'BTC Price',
  'metrics.refresh': 'Refresh metrics',

  // Section: Layer 0
  'about.title1': 'THE BITCOIN-NATIVE',
  'about.title2': 'LAYER 0',
  'about.subtitle': 'Unlocking seamless DeFi experiences across Bitcoin.',
  'about.subtitleEmph': 'across',

  // Native Assets section
  'assets.heading': 'NATIVE ASSETS',
  'assets.description': 'A new class of assets moving seamlessly in, out, and across all Bitcoin metaprotocols and L2s.',
  'assets.live': 'Live!',
  'assets.frbtc.symbol': 'frBTC',
  'assets.frbtc.name': 'The BTC Synthetic',
  'assets.frbtc.description': 'Enabling the seamless use of native BTC in dApps, completely abstracting away the wrap process.',
  'assets.frusd.symbol': 'frUSD',
  'assets.frusd.name': 'Stablecoin Utilization on Bitcoin',
  'assets.frusd.description': 'The most capital-efficient bridge from USDT and USDC to Bitcoin L1.',
  'assets.others.symbol': 'Other Majors',
  'assets.others.name': 'Bridge High Volume Assets to Bitcoin',
  'assets.others.description': 'SUBFROST can bridge any EVM- or UTXO-based asset to Bitcoin L1.',

  // The Subfrost App section
  'subfrostApp.heading': 'SUBFROST APP',
  'subfrostApp.subheading': 'Unrivaled UX and novel DeFi features on Bitcoin for the first time.',

  // Features Grid
  'features.keyFeatures': 'Key Features',
  'features.overviewTitle': 'SUBFROST APP OVERVIEW',
  'features.overviewDescription': 'Click through the key features to learn about what the SUBFROST app delivers.',
  'features.demoComingSoon': 'Demo Coming Soon',

  'features.amm.buttonTitle': 'AMM SWAPS & LIMIT ORDERS',
  'features.amm.title': 'AMM SWAPS & LIMIT ORDERS',
  'features.amm.desc1': 'For the first time, execute AMM swaps of major assets directly on Bitcoin L1. Single-transaction swaps between BTC, USDT, USDC, ADA, and ZEC... as well as Bitcoin-native assets like Alkanes and BRC20s.',
  'features.amm.desc2': 'Want more control over execution price? Set your price targets and let SUBFROST execute swaps automatically when the market hits your limit order.',

  'features.bridge.buttonTitle': 'CROSS-CHAIN ON BITCOIN',
  'features.bridge.title': 'CROSS-CHAIN BRIDGE ON BITCOIN',
  'features.bridge.desc1': 'Combined in the same UX as AMM Swaps, users seamlessly bridge and swap in a single flow. Send assets from another chain and receive the desired asset directly on Bitcoin L1.',
  'features.bridge.desc2': 'No requirement of wrapping your BTC, trusting a centralized custodian, or sending it to other chains to make it useful.',

  'features.vaults.buttonTitle': 'DEFI YIELD VAULTS',
  'features.vaults.title': 'DEFI YIELD VAULTS',
  'features.vaults.desc1': 'Lock up your LP tokens in Olympus-style vaults and earn rewards without ever leaving Bitcoin L1.',
  'features.vaults.desc2': 'The best part? No need to manually LP first, just select your desired LP and lock-up period, then send your native BTC to the vault and SUBFROST will handle the rest.',

  'features.futures.buttonTitle': 'BITCOIN FUTURES MARKET',
  'features.futures.title': 'BITCOIN FUTURES MARKET',
  'features.futures.desc1': 'On-chain futures market powered by miner block rewards.',
  'features.futures.desc2': 'Miners hedge their 100-block lock times, SUBFROST issues futures on their locked BTC, and users speculate on BTC price movement while having the option to exercise early for a small premium.',

  'features.dxbtc.buttonTitle': 'TOKENIZED BTC YIELD',
  'features.dxbtc.title': 'TOKENIZED BTC YIELD',
  'features.dxbtc.desc1': 'The simplest way to earn yield on your BTC: 1 transaction.',
  'features.dxbtc.desc2': 'Fees and yield strategies across SUBFROST offerings aggregate into yield sources for dxBTC while users maintain full price exposure to BTC.',
  'features.dxbtc.desc3': 'Unstake anytime with no lock-up period.',

  // Team & Partners section
  'team.heading': 'SUBFROST TEAM',
  'team.subheading': 'High-output team with traction, dedicated following, and proven track record of deployments.',
  'partners.heading': 'Featured Partners',
  'partners.morePartners': '10+ other partners. Please inquire and we will confirm authenticity of relationships.',

  // Team member titles
  'team.title.founderCeo': 'Founder/CEO',
  'team.title.founderCto': 'Founder/CTO',
  'team.title.apacMarketing': 'APAC Marketing Director',
  'team.title.advisor': 'Advisor',

  // Team descriptions
  'team.gabe.description': 'Strategy Consultant with an obsession for lowering the friction in finance.',
  'team.flex.description': 'Reknowned Crypto Dev since 2016. Creator of Protorunes/Alkanes. Former CTO of Polymarket and IDEX.',
  'team.brooks.description': 'Decade in Chinese Network Building & Blockchain Marketing. Now the leading voice in China for SUBFROST & Alkanes.',
  'team.domo.description': 'Creator of BRC20, the first token standard on Bitcoin.',
  'team.hex.description': 'Founder/CEO of Saturn DEX.',
  'team.allen.description': 'Founder of Google web3. Partner at Primitive Ventures.',
  'team.binari.description': 'Founder/CEO of Best In Slot (creator of BRC2.0).',
  'team.eran.description': 'Serial Founder/CEO with several Cyber exits.',
  'team.hath.description': 'Founder of Omnisat, LaserEyes, BeatBlocks and Alkamist.',

  // Partner descriptions
  'partners.oyl.desc': 'Premier AMM on Alkanes (now open-source)',
  'partners.saturn.desc': 'Premier AMM/DEX on Arch Network',
  'partners.bis.desc': 'Premier AMM on BRC2.0 (instant swaps on Bitcoin)',
  'partners.satsTerminal.desc': 'Swap for Alkanes, Runes, and Spark Tokens',
  'partners.boundMoney.desc': 'USD Stablecoin (bUSD) on Bitcoin Layer-1',
  'partners.layer1.desc': 'BRC20 and Metaprotocol Development & Support',

  // Partner tags
  'partners.tag.defi': 'DeFi',
  'partners.tag.tools': 'Tools',
  'partners.tag.explorer': 'Explorer',
  'partners.tag.stable': 'Stable Coin',
  'partners.tag.group': 'Group',
  'partners.tag.infra': 'Infra',
  'partners.tag.audits': 'Audits (TBD)',

  // Footer
  'footer.tagline': 'The Bitcoin-native Layer 0, bringing next-gen DeFi to Bitcoin',
  'footer.bySubzero': 'By Subzero Research Inc.',
  'footer.product': 'Product',
  'footer.launchApp': 'Launch App',
  'footer.documentation': 'Documentation',
  'footer.apiReference': 'API Reference',
  'footer.apiLogin': 'API Login',
  'footer.community': 'Community',
  'footer.xTwitter': 'X (Twitter)',
  'footer.discord': 'Discord',
  'footer.github': 'GitHub',
  'footer.contactUs': 'Contact Us',
  'footer.emailUs': 'Email Us',
  'footer.messageOnX': 'Message us on X',
  'footer.legal': 'Legal',
  'footer.terms': 'Terms of Service',
  'footer.privacy': 'Privacy Policy',
  'footer.copyright': '© 2025 Subzero Research Inc. All rights reserved.',
  'footer.disclaimer': 'Not financial advice. Use at your own risk.',

  // Volume Modal
  'volume.title': 'SUBFROST Protocol Volumes',
  'volume.both': 'Both',
  'volume.alkanes': 'Alkanes',
  'volume.brc20': 'BRC20',
  'volume.volume': 'Volume',
  'volume.cumulative': 'Cumulative',
  'volume.wraps': 'Wraps',
  'volume.unwraps': 'Unwraps',
  'volume.totalWraps': 'Total Wraps',
  'volume.totalUnwraps': 'Total Unwraps',
  'volume.loadingChart': 'Loading chart…',
  'volume.close': 'Close',
};

export default en;
