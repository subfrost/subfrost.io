import { Preloader } from '@/ui/base/preloader';
import '@css/animate.css';
import '@css/basic.css';
import '@css/layout.css';
import '@css/ionicons.css';
import '@css/magnific-popup.css';
import '@css/theme.css';
import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import State from '@/stores/global';
import { sharedMetadata } from '@/utils/metadata';

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['100', '300', '400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap'
});
export const metadata = sharedMetadata;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={robotoMono.variable}>
        <Preloader />
        <State>{children}</State>
      </body>
    </html>
  );
}
