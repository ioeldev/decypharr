import { NavLink } from 'react-router-dom';

export default function RepairNavigation() {
  return <nav className="tabs tabs-border" aria-label="Repair navigation">
    <NavLink className="tab" end to="/repair">Health checks</NavLink>
    <NavLink className="tab" to="/repair/library">Library findings</NavLink>
    <NavLink className="tab" to="/repair/reacquire">Recovery jobs</NavLink>
  </nav>;
}
