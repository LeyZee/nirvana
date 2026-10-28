import { Outlet, useRouteContext } from '@tanstack/react-router';
import type { JSX } from 'react';

import { AlertsSection } from '@/settings/alerts/AlertsSection';
import { BackupsSection } from '@/settings/backups/BackupsSection';
import { PayRulesSection } from '@/settings/pay/PayRulesSection';
import { ServicesSection } from '@/settings/services/ServicesSection';
import { TelegramSection } from '@/settings/telegram/TelegramSection';
import type { TelegramTab } from '@/settings/telegram/search';
import { ComingSoon, Page, PageHeader, SubNav, type SubNavItem } from '@/shell/layout';

import './settings.css';

/** The alerts and the backups are the owner's alone (P4-01, ADR 0028): anyone else gets no tab that would answer 403. */
const ALERTS_TAB: SubNavItem = { to: '/reglages/alertes', label: 'Alertes' };
const BACKUPS_TAB: SubNavItem = { to: '/reglages/sauvegardes', label: 'Sauvegardes' };
/** The accounts' pay rules too (EQ-03): the owner alone posts them. */
const PAY_RULES_TAB: SubNavItem = { to: '/reglages/regles-de-paie', label: 'Règles de paie' };
/** The AI keys and the bots and groups too (P3-03, P3-07): the server serves them to the owner alone. */
const AI_MODELS_TAB: SubNavItem = { to: '/reglages/modeles-ia', label: 'Modèles IA' };
const TELEGRAM_TAB: SubNavItem = { to: '/reglages/telegram', label: 'Telegram' };

export function SettingsLayout(): JSX.Element {
  const { user, onSignOut } = useRouteContext({ from: '__root__' });
  return (
    <Page>
      <PageHeader
        title="Réglages"
        actions={
          <>
            <SubNav
              label="Réglages"
              items={[
                ...(user.role === 'owner' ? [AI_MODELS_TAB, ALERTS_TAB] : []),
                ...(user.role === 'owner' ? [TELEGRAM_TAB, PAY_RULES_TAB, BACKUPS_TAB] : []),
                { to: '/reglages/appareils', label: 'Appareils' },
                { to: '/reglages/apparence', label: 'Apparence' },
                { to: '/reglages/mode', label: 'Mode de l’agent' },
              ]}
            />
            <button type="button" className="nv-btn nv-btn--plain nv-btn--sm st-signout" onClick={onSignOut}>
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

/** Réglages › Alertes: her own alerts and the system's, on each creator (P4-01). */
export function AlertsPage(): JSX.Element {
  return <AlertsSection />;
}

/** Réglages › Telegram: bots, groups and who gets which alert (fiche P3-07), the tab in the address. */
export function TelegramPage({
  tab,
  onTab,
}: {
  tab: TelegramTab;
  onTab: (tab: TelegramTab) => void;
}): JSX.Element {
  return <TelegramSection tab={tab} onTab={onTab} />;
}

/** Réglages › Règles de paie: each account's currency, VAT, platform commission and source of sales (EQ-03). */
export function PayRulesPage(): JSX.Element {
  return <PayRulesSection />;
}

/** Réglages › Sauvegardes: the nightly export and the restore test (EQ-17, ADR 0028). */
export function BackupsPage(): JSX.Element {
  return <BackupsSection />;
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
