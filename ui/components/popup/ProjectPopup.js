'use client';
import { useGlobalContext } from '@/stores/global';
import { LINKS } from '@/utils/constants';
import { SocialLink } from '../social-link';
import PopContainer from './PopupContainer';
const ProjectPopup = () => {
  const { setPortfolioModal, portfolioModal } = useGlobalContext();
  console.log('port', portfolioModal);
  return (
    <PopContainer nullValue={setPortfolioModal}>
      <div className="content">
        {/* {portfolioModal.gallery.map((g, i) => (
        <div className="image" key={`portfolio-modal-${portfolioModal.title}-${i}`}>
        <img src={g} alt={portfolioModal.description} />
      </div>
        ))} */}
        <div className="image">
          <img
            src={portfolioModal.gallery[0]}
            alt={portfolioModal.description}
          />
        </div>
        <div className="desc">
          <div className="flex items-center justify-between">
            <div>
              <span className="category">{portfolioModal.category}</span>
              <h4>{portfolioModal.title}</h4>
            </div>
            <div className="flex items-center gap-1">
              {portfolioModal.github && (
                <SocialLink
                  link={portfolioModal.github}
                  icon="github"
                  size="18px"
                />
              )}
              {portfolioModal.twitter && (
                <SocialLink
                  link={portfolioModal.twitter}
                  icon="twitter"
                  size="18px"
                />
              )}
            </div>
          </div>
          <p>{portfolioModal.description}</p>
          <a
            href={portfolioModal.link}
            target="_blank"
            className="btn"
            data-text="View Project"
          >
            View Project
          </a>
        </div>
      </div>
    </PopContainer>
  );
};
export default ProjectPopup;
