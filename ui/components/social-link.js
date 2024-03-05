export const SocialLink = ({ link, icon, size }) => {
  const renderIcon = () => {
    switch (icon) {
      case 'github':
        return 'ion-social-github';
      case 'linkedin':
        return 'ion-social-linkedin';
      case 'twitter':
        return 'ion-social-twitter';
      default:
        return 'ion-calendar';
    }
  };
  return (
    <a target="_blank" href={link} className="p-0.5">
      <span
        className={`ion ${renderIcon()}`}
        style={{ fontSize: size ?? '16px' }}
      />
    </a>
  );
};
