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
              alt="Bring your runes-based protocol to life by deploying SUBFROST to your protocol DAO."
            />
            
          <GlitchText text="Subfrost" />
          
            <TypedStrings
              strings={[
                'Build on any network.',
                'Define your rules.',
                'Powered by Substrate.',
                'Built with Rust.',
                'AssemblyScript runtime.',
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
