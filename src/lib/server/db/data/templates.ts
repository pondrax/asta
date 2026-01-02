export default [
  {
    id: 'persetujuan-pengguna',
    name: "Persetujuan Sertifikat Elektronik",
    file: '/uploads/templates/persetujuan-pengguna.pdf',
    properties: {
      description: "Formulir Persetujuan Sertifikat Elektronik",
      to: ['admin'],
      type: 'bsre',

    },
  },
  {
    id: 'pengajuan-email',
    name: "Pengajuan Email Dinas",
    file: '/uploads/templates/pengajuan-email.pdf',
    properties: {
      description: "Formulir Pengajuan Email Dinas",
      to: ['admin', 'infra'],
      type: 'manual'
    },
  }
]