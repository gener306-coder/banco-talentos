export function StudentStatus({ active }: { active: boolean }) {
  return <span className={`student-status ${active ? 'active' : 'inactive'}`}>{active ? 'ACTIVO' : 'INACTIVO'}</span>
}
