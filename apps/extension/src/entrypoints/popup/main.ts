import '@nirvana/design-system/styles.css';

import { popupTitle } from './title';

const app = document.getElementById('app');
if (app !== null) {
  app.textContent = popupTitle();
}
