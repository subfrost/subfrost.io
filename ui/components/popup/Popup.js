'use client';
import { context } from '@/stores/global';
import { Fragment, useContext } from 'react';
import EmbedPopup from './EmbedPopup';
import ImageGallery from './ImageGallery';
import ImageView from './ImageView';
import ProjectPopup from './ProjectPopup';
const Popup = () => {
  const { modal, portfolioModal, blogModal } = useContext(context);
  return (
    <Fragment>
      <EmbedPopup />
      <ImageView />
      <ImageGallery />
      {modal && portfolioModal && <ProjectPopup />}
    </Fragment>
  );
};
export default Popup;
