import {
  AddToHomeScreenIcon,
  AddressBarInstallIcon,
  BrowserMenuIcon,
  DoneIcon,
  ShareIcon,
} from '../../shared/ui/icons.tsx';
import type { InstallGuides } from './types.ts';

/**
 * The install steps in Spanish. The words in bold are the ones Safari, Chrome and Edge show in
 * a Spanish interface, so they are quoted rather than translated freshly.
 */
export const esInstall: InstallGuides = {
  ios: {
    label: 'iPhone',
    steps: [
      {
        icon: ShareIcon,
        text: <>Toca el botón de compartir en la barra de Safari.</>,
      },
      {
        icon: AddToHomeScreenIcon,
        text: (
          <>
            Desplázate hacia abajo y elige <b>Agregar a pantalla de inicio</b>.
          </>
        ),
      },
      {
        icon: DoneIcon,
        text: (
          <>
            Toca <b>Agregar</b>. La app aparece en tu pantalla de inicio.
          </>
        ),
      },
    ],
    note: (
      <>
        Safari siempre lo ofrece. Chrome, Edge y Firefox en el iPhone o iPad usan el mismo menú, y
        lo ofrecen donde está disponible.
      </>
    ),
  },
  android: {
    label: 'Android',
    steps: [
      { icon: BrowserMenuIcon, text: <>Abre el menú en la barra de Chrome.</> },
      {
        icon: AddToHomeScreenIcon,
        text: (
          <>
            Elige <b>Instalar aplicación</b> o <b>Agregar a la pantalla principal</b>.
          </>
        ),
      },
      {
        icon: DoneIcon,
        text: (
          <>
            Confirma con <b>Instalar</b>.
          </>
        ),
      },
    ],
  },
  desktop: {
    label: 'Computadora',
    steps: [
      {
        icon: AddressBarInstallIcon,
        text: (
          <>
            En Chrome o Edge, haz clic en el botón de instalar al final de la barra de direcciones.
          </>
        ),
      },
      {
        icon: DoneIcon,
        text: (
          <>
            Elige <b>Instalar</b>. La aplicación se abre en su propia ventana.
          </>
        ),
      },
    ],
    note: (
      <>
        Safari en el Mac la instala desde <b>Compartir → Agregar al Dock</b>. Firefox no instala
        aplicaciones web, pero el sitio sigue funcionando sin conexión una vez abierto.
      </>
    ),
  },
};
