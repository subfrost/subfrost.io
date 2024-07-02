const title = 'Subfrost | L0 for Metaprotocols';
const description =
  'The first Layer-0 stack for a metaprotocol world. Decentralized and stateless compute, enabling protocols to be built on any network.';

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
