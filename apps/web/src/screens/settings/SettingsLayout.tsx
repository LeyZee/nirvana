import { Outlet, useRouteContext } from '@tanstack/react-router';
import type { JSX } from 'react';

import { ServicesSection } from '@/settings/services/ServicesSection';
import { TelegramSection } from '@/settings/telegram/TelegramSection';
import { ComingSoon, Page, PageHeader, SubNav } from '@/shell/layout';

export function SettingsLayout(): JSX.Element {
  const { onSignOut } = useRouteContext({ from: '__root__' });
  return (
    <Page>
      <PageHeader
        title="Réglages"
        actions={
          <>
            <SubNav
              label="Réglages"
              items={[
                { to: '/reglages/modeles-ia', label: 'Modèles IA' },
                { to: '/reglages/telegram', label: 'Telegram' },
                { to: '/reglages/appareils', label: 'Appareils' },
                { to: '/reglages/mode', label: 'Mode de l’agent' },
              ]}
            />
            <button type="button" className="nv-btn nv-btn--plain nv-btn--sm md:hidden" onClick={onSignOut}>
              Se déconnecter
            </button>
          </>
        }
      />
      <Outlet />
    </Page>
  );
}

/** Réglages › Modèles IA: the Services page of P3-03, as the Connecteurs thread built it. */
export function AiModelsPage(): JSX.Element {
  return <ServicesSection />;
}

/** Réglages › Telegram: bots, groups and who gets which alert (fiche P3-07). */
export function TelegramPage(): JSX.Element {
  return <TelegramSection />;
}

export function DevicesPage(): JSX.Element {
  return (
    <ComingSoon
      title="Les extensions reliées"
      what="Chaque navigateur où l’extension tourne, sa session Reveal et le moyen de le délier."
      when="Avec l’extension"
    />
  );
}

export function AgentModePage(): JSX.Element {
  return (
    <ComingSoon
      title="Copilote ou automatique"
      what="Le mode se change en haut du Dashboard. L’automatique s’ouvre quand le serveur valide le taux en réel et le test à l’aveugle ; le Dashboard dit ce qui manque, chiffres à l’appui."
      when="Après le copilote"
    />
  );
}
