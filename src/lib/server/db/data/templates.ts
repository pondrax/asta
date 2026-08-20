import { db } from ".."

export default async () => {
  console.log('Upserting templates...')
  await db.query.templates.upsert({
    data: [
      {
        id: 'persetujuan-pengguna',
        name: "Persetujuan Sertifikat Elektronik",
        file: '/uploads/templates/persetujuan-pengguna.pdf',
        description: "Formulir Persetujuan Sertifikat Elektronik",
        to: ['admin'],
        sign_type: 'bsre',
      },
      {
        id: 'pengajuan-email',
        name: "Pengajuan Email Dinas",
        file: '/uploads/templates/pengajuan-email.pdf',
        description: "Formulir Pengajuan Email Dinas",
        to: ['admin', 'infra'],
        sign_type: 'manual',
      }
    ]
  })
  console.log('Templates upserted successfully!')
}