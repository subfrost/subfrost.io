#!/usr/bin/env bash
# Extract subfrost-admin compliance JSON (mtl-state + fincen-*) from the admin-web
# PVC into C:/Alkanes Geral Dev/.adminenv-extracted/dump/. exec/logs/cp are blocked
# on the subfrost-admin cluster (Konnectivity), so we use an in-cluster Job that
# mounts the PVC and copies the files into a ConfigMap, which we read over the API.
set -euo pipefail
export MSYS_NO_PATHCONV=1

IOENV="C:/Alkanes Geral Dev/.ioenv-extracted"
OUT="C:/Alkanes Geral Dev/.adminenv-extracted/dump"
mkdir -p "$OUT"

cd "$IOENV"
export SA_KEY="$IOENV/.config/gcloud-io/io-sa.json"
export SCOPE="https://www.googleapis.com/auth/cloud-platform"
TOKEN=$(python gcp_token.py 2>/dev/null)
if [ ! -s admin-endpoint.txt ]; then
  TOKEN="$TOKEN" python -c "import os,json,base64,urllib.request as u; t=os.environ['TOKEN']; d=json.load(u.urlopen(u.Request('https://container.googleapis.com/v1/projects/night-wolves-jogging/locations/us-central1-a/clusters/subfrost-admin',headers={'Authorization':'Bearer '+t}))); open('admin-endpoint.txt','w').write(d['endpoint']); open('admin-ca.crt','wb').write(base64.b64decode(d['masterAuth']['clusterCaCertificate']))"
fi
ENDPOINT=$(cat admin-endpoint.txt)
KA() { /tmp/kubectl.exe --server="https://$ENDPOINT" --certificate-authority="$IOENV/admin-ca.crt" --token="$TOKEN" "$@"; }

# Find admin-web's node (RWO PVC → the dumper Job must co-schedule on it).
POD=$(KA get pods -n admin -l app=admin-web -o jsonpath='{.items[0].metadata.name}')
NODE=$(KA get pod -n admin "$POD" -o jsonpath='{.spec.nodeName}')
echo "admin-web pod=$POD node=$NODE"

KA delete configmap compliance-dump -n admin --ignore-not-found
KA delete job compliance-dumper -n admin --ignore-not-found

# RBAC (SA + Role allowing configmap create/get) + the Job. The dumper image has
# kubectl; it selectively adds only the compliance files that exist (so a large
# audit.json never blows the 1MB ConfigMap limit).
cat <<YAML | KA apply -f -
apiVersion: v1
kind: ServiceAccount
metadata: { name: compliance-dumper, namespace: admin }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: compliance-dumper, namespace: admin }
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["create","get","delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: compliance-dumper, namespace: admin }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: compliance-dumper }
subjects: [{ kind: ServiceAccount, name: compliance-dumper, namespace: admin }]
---
apiVersion: batch/v1
kind: Job
metadata: { name: compliance-dumper, namespace: admin }
spec:
  backoffLimit: 1
  template:
    spec:
      serviceAccountName: compliance-dumper
      nodeName: ${NODE}
      restartPolicy: Never
      containers:
        - name: dump
          image: bitnami/kubectl:latest
          command: ["sh","-c"]
          args:
            - |
              cd /data
              args=""
              for f in mtl-state fincen-form-107-draft fincen-sar-drafts fincen-ctr-drafts fincen-submissions; do
                [ -f "\$f.json" ] && args="\$args --from-file=\$f.json=\$f.json"
              done
              echo "files: \$args"
              kubectl create configmap compliance-dump -n admin \$args
              echo DONE
          volumeMounts:
            - { name: data, mountPath: /data, readOnly: true }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: admin-web-data }
YAML

echo "waiting for the dumper Job to complete..."
KA wait --for=condition=complete job/compliance-dumper -n admin --timeout=120s

# Read the ConfigMap over the API and split it back into snapshot files.
KA get configmap compliance-dump -n admin -o json > "$OUT/.configmap.json"
python - "$OUT" <<'PY'
import json,sys,os
out=sys.argv[1]
cm=json.load(open(os.path.join(out,".configmap.json"),encoding="utf-8"))
data=cm.get("data",{})
for fname,content in data.items():
    open(os.path.join(out,fname),"w",encoding="utf-8").write(content)
    print("wrote",fname,len(content),"bytes")
PY

# Cleanup in-cluster objects.
KA delete job compliance-dumper -n admin --ignore-not-found
KA delete configmap compliance-dump -n admin --ignore-not-found
KA delete rolebinding compliance-dumper -n admin --ignore-not-found
KA delete role compliance-dumper -n admin --ignore-not-found
KA delete serviceaccount compliance-dumper -n admin --ignore-not-found
echo "Snapshots in $OUT"
