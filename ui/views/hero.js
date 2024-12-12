'use client';
import { TypedStrings, GlitchText } from '@/ui/components';
import Image from 'next/image';

const Hero = ({ mouse }) => {
  return (
    <div className="section started" style={{ height: '96vh' }}>
      <div className="centrize full-width">
        <div className="vertical-center">
          <div className="started-content">
            <Image
              src="/images/subfrost.svg"
              height={60}
              width={60}
              alt="Federated synthetics on Bitcoin L1. Interoperability built on stables."
            />

            <GlitchText text="SUBFROST" />

            <TypedStrings
              strings={[
                'BTC synthetics on metaprotocols.',
                '1:1 reserve.',
                'Synthetics on ALKANES.',
                'Synthetics on OP_NET.'
              ]}
              options={{
                loop: true,
                typeSpeed: 80,
                backSpeed: 40,
                backDelay: 800
              }}
            />
          </div>
        </div>
      </div>
      {mouse && (
        <a href="#" className="mouse_btn">
          <span className="ion ion-mouse"></span>
        </a>
      )}
    </div>
  );
};

export default Hero;
