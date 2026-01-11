{{/*
Expand the name of the chart.
*/}}
{{- define "esm-do.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "esm-do.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "esm-do.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "esm-do.labels" -}}
helm.sh/chart: {{ include "esm-do.chart" . }}
{{ include "esm-do.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "esm-do.selectorLabels" -}}
app.kubernetes.io/name: {{ include "esm-do.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "esm-do.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "esm-do.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper image name
*/}}
{{- define "esm-do.image" -}}
{{- $registryName := .Values.image.repository -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" $registryName $tag -}}
{{- end }}

{{/*
Return the secret name for the application
*/}}
{{- define "esm-do.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "esm-do.fullname" . }}
{{- end }}
{{- end }}

{{/*
Return the configmap name for the application
*/}}
{{- define "esm-do.configMapName" -}}
{{- include "esm-do.fullname" . }}
{{- end }}

{{/*
Create the container port name
*/}}
{{- define "esm-do.containerPortName" -}}
http
{{- end }}

{{/*
Checksum for config/secret to trigger rolling updates
*/}}
{{- define "esm-do.configChecksum" -}}
{{- include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
{{- end }}

{{/*
Pod annotations including config checksum
*/}}
{{- define "esm-do.podAnnotations" -}}
{{- if .Values.podAnnotations }}
{{- toYaml .Values.podAnnotations }}
{{- end }}
checksum/config: {{ include "esm-do.configChecksum" . }}
{{- end }}

{{/*
Generate environment variables from config
*/}}
{{- define "esm-do.envVars" -}}
- name: PORT
  value: {{ .Values.service.targetPort | quote }}
- name: LOG_LEVEL
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: LOG_LEVEL
- name: DEV_MODE
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: DEV_MODE
- name: REQUEST_TIMEOUT
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: REQUEST_TIMEOUT
- name: METRICS_ENABLED
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: METRICS_ENABLED
- name: CORS_ENABLED
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: CORS_ENABLED
- name: CORS_ORIGINS
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: CORS_ORIGINS
- name: NODEJS_COMPAT
  valueFrom:
    configMapKeyRef:
      name: {{ include "esm-do.configMapName" . }}
      key: NODEJS_COMPAT
{{- end }}
