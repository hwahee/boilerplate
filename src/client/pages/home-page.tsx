/**
 * Home — the todos demo and the upload demo, with the home chat room beside
 * them. The chat is attached, not built in: the page only places `HomeChat`,
 * whose room is @shared/domain/home-chat.
 */
import { TESTID } from '../testing/testids';
import { HomeChat } from './home-chat';
import { TodosPage } from './todos-page';
import { UploadDemo } from './upload-demo';

export function HomePage() {
  return (
    <div className="home-layout" data-testid={TESTID.home.page}>
      <div className="home-layout__main">
        <TodosPage />
        <UploadDemo />
      </div>
      <HomeChat />
    </div>
  );
}
