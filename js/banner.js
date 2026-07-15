const onDismissKey = Symbol('bannerOnDismiss');

/**
 * @param {{
 *   id: string,
 *   message: string,
 *   role?: string,
 *   onDismiss?: () => void,
 * }} options
 */
export function showMessageBanner({ id, message, role = 'status', onDismiss }) {
  let banner = document.getElementById(id);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = id;
    banner.className = 'storage-warning';
    banner.setAttribute('role', role);

    const text = document.createElement('p');
    text.className = 'storage-warning-text';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'storage-warning-dismiss';
    dismiss.textContent = 'Закрыть';
    dismiss.setAttribute('aria-label', 'Закрыть предупреждение');
    dismiss.addEventListener('click', () => {
      banner[onDismissKey]?.();
      banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(dismiss);
    const host = document.getElementById('app') ?? document.body;
    host.prepend(banner);
  } else {
    banner.setAttribute('role', role);
  }

  banner[onDismissKey] = onDismiss;

  const text = banner.querySelector('.storage-warning-text');
  if (text) text.textContent = message;
}
