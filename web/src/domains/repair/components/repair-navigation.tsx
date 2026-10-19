import { Link, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';

const sections = [
  { path: '/repair', title: 'Health checks' },
  { path: '/repair/library', title: 'Library findings' },
  { path: '/repair/reacquire', title: 'Recovery jobs' },
];

export default function RepairNavigation() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Repair navigation" className="min-w-0 overflow-x-auto">
      <Tabs value={pathname}>
        <TabsList>
          {sections.map(({ path, title }) => (
            <TabsTrigger key={path} value={path} asChild>
              <Link to={path}>{title}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}
