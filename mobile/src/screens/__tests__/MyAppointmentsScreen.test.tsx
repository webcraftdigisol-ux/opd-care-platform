import { render, screen, waitFor } from '@testing-library/react-native';
import type { Appointment } from '@opd/shared';
import { MyAppointmentsScreen } from '../MyAppointmentsScreen';
import { listMyAppointments } from '../../api/appointments';

jest.mock('../../api/appointments');
// The screen calls useFocusEffect, which normally needs a NavigationContainer
// ancestor -- for a plain render test, just run the effect once on mount.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(callback, []);
  },
}));

const mockListMyAppointments = listMyAppointments as jest.MockedFunction<typeof listMyAppointments>;

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    date: '2099-01-01',
    tokenNumber: 3,
    startTime: '10:30',
    status: 'BOOKED',
    isWalkIn: false,
    consultationFee: 500,
    reason: undefined,
    doctor: {
      id: 'doctor-1',
      userId: 'user-1',
      specialization: 'Cardiology',
      department: 'OPD',
      slotMinutes: 15,
      consultationFee: 500,
      user: { id: 'user-1', name: 'Dr. Asha Rao', email: 'asha@example.com', role: 'DOCTOR' },
    },
    ...overrides,
  } as Appointment;
}

describe('MyAppointmentsScreen', () => {
  afterEach(() => jest.resetAllMocks());

  it('shows an empty state once loading finishes with no appointments', async () => {
    mockListMyAppointments.mockResolvedValue([]);
    render(<MyAppointmentsScreen />);

    // FlatList surfaces "No appointments yet." both as the ListEmptyComponent
    // prop and as its rendered child, so a plain getByText sees two matches.
    await waitFor(() => expect(screen.getAllByText('No appointments yet.').length).toBeGreaterThan(0));
  });

  it('renders a fetched appointment with doctor name, date, and token number', async () => {
    mockListMyAppointments.mockResolvedValue([makeAppointment()]);
    render(<MyAppointmentsScreen />);

    await waitFor(() => expect(screen.getByText('Dr. Asha Rao')).toBeTruthy());
    expect(screen.getByText(/Cardiology/)).toBeTruthy();
    expect(screen.getByText(/10:30/)).toBeTruthy();
    expect(screen.getByText('#3')).toBeTruthy();
    expect(screen.getByText('Booked')).toBeTruthy();
  });

  it('omits the time from the meta line for a walk-in (no startTime)', async () => {
    mockListMyAppointments.mockResolvedValue([makeAppointment({ startTime: null, isWalkIn: true })]);
    render(<MyAppointmentsScreen />);

    await waitFor(() => expect(screen.getByText('Dr. Asha Rao')).toBeTruthy());
    expect(screen.getByText('Cardiology · 2099-01-01')).toBeTruthy();
  });

  it('only shows "Cancel appointment" for a future, still-booked appointment', async () => {
    mockListMyAppointments.mockResolvedValue([
      makeAppointment({ id: 'future', status: 'BOOKED', date: '2099-01-01' }),
      makeAppointment({ id: 'past', status: 'COMPLETED', date: '2000-01-01' }),
    ]);
    render(<MyAppointmentsScreen />);

    await waitFor(() => expect(screen.getAllByText('Cancel appointment')).toHaveLength(1));
  });
});
