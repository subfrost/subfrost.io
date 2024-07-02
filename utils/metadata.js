const title = 'SUBFROST | L0 for runes.'
const description =
  'Layer-0 stack for runes and protorunes. Decentralized algorithmic stables pegged to BTC, all on runes.'

export const sharedMetadata = {
  metadataBase: new URL('https://subfrost.io/'),
  title,
  description,
  applicationName: title,
  authors: [{ name: 'Subfrost & Co.' }],
  openGraph: {
    title,
    description,
    images: [
      {
        url: 'android-chrome-512x512.png'
      }
    ],
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    site: '@subfrost.io',
    title,
    description,
    images: [{ url: 'android-chrome-512x512.png' }]
  },
  keywords: ['frost', 'signature', 'blockchain', 'signing schema', 'brc20']
};
