import { OnePageLink } from './link';

export const ResumeItem = ({ date, position, company, link, list }) => (
  <div className="resume-item">
    <div className="date">{date}</div>
    <div className="name">
      <span>
        {position} |{' '}
        {link ? (
          <OnePageLink href={link} target="_blank">
            {company}
          </OnePageLink>
        ) : (
          company
        )}
      </span>
    </div>
    <ul className="dotted-list">
      {list &&
        list.map((el, i) => <li key={`resume-item-${company}-${i}`}>{el}</li>)}
    </ul>
  </div>
);
