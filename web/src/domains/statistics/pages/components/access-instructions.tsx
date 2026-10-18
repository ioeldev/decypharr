import { objectValue, stringValue, numberValue, type JsonObject } from '../../../../shared/api/json-response';
import { useMutation } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';

export default function AccessInstructions({ access }: { access: JsonObject }) {
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  const webdav = objectValue(access.webdav);
  const nfs = objectValue(access.nfs);
  const smb = objectValue(access.smb);
  const host = window.location.hostname;
  const nfsOptions = `vers=4.0,tcp,port=${numberValue(nfs.port) || 20490},ro`;
  const smbPort = numberValue(smb.port) || 1445;
  const user = stringValue(smb.username) || 'USERNAME';
  const share = stringValue(smb.share_name) || 'decypharr';
  const commands = [
    ...(webdav.enabled ? [{ label: 'WebDAV URL', value: window.location.origin + (stringValue(webdav.path) || '/webdav') + '/' }] : []),
    ...(nfs.enabled ? [
      { label: 'NFS · Linux', value: `sudo mount -t nfs -o ${nfsOptions} ${host}:/ /mnt/decypharr` },
      { label: 'NFS · macOS', value: `sudo mount -t nfs -o ${nfsOptions},resvport ${host}:/ /Volumes/decypharr` },
    ] : []),
    ...(smb.enabled ? [
      { label: 'SMB · Windows', value: `net use Z: \\\\${host}\\${share} /user:${user}` },
      { label: 'SMB · macOS', value: `open smb://${user}@${host}:${smbPort}/${share}` },
      { label: 'SMB · Linux', value: `sudo mount -t cifs -o vers=3.1.1,port=${smbPort},user=${user},ro //${host}/${share} /mnt/decypharr` },
    ] : []),
  ];

  return <div className="space-y-3">
    {commands.map((command) => <div key={command.label}><p>{command.label}</p><div className="flex gap-3 items-center">
      <code className="block p-3 bg-base-200 flex-1 break-all">{command.value}</code>
      <button className="btn btn-xs" onClick={() => action.mutate(async () => { await navigator.clipboard.writeText(command.value); return `${command.label} copied.`; })}>Copy</button>
    </div></div>)}
    {webdav.enabled ? <p>{webdav.auth_required ? 'WebDAV requires your Decypharr username and password.' : 'WebDAV does not require authentication.'}</p> : null}
    {nfs.enabled ? <p>Create the mount directory first. Behind Docker or NAT, use the mapped host port.</p> : null}
    {smb.enabled ? <p>SMB is read-only, signed but not encrypted. Windows requires host port 445 mapped to {smbPort}.</p> : null}
    <ActionMessage state={action} />
  </div>;
}
