import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DoctorProfile } from '@opd/shared';
import { bookAppointment, listDoctors } from '../api/appointments';
import { colors } from '../theme';

export function BookAppointmentScreen({ navigation }: { navigation: any }) {
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listDoctors()
      .then(setDoctors)
      .finally(() => setLoading(false));
  }, []);

  async function handleBook() {
    if (!selectedDoctor) {
      Alert.alert('Select a doctor', 'Please choose a doctor to continue.');
      return;
    }
    setSubmitting(true);
    try {
      const appointment = await bookAppointment({ doctorId: selectedDoctor, date, reason: reason || undefined });
      Alert.alert('Appointment booked', `Your token number is #${appointment.tokenNumber}`, [
        { text: 'OK', onPress: () => navigation.navigate('MyAppointments') },
      ]);
    } catch (err: any) {
      Alert.alert('Booking failed', err.response?.data?.message ?? 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Select Doctor</Text>
      {doctors.map((d) => (
        <Pressable
          key={d.id}
          style={[styles.doctorCard, selectedDoctor === d.id && styles.doctorCardActive]}
          onPress={() => setSelectedDoctor(d.id)}
        >
          <Text style={styles.doctorName}>{d.user.name}</Text>
          <Text style={styles.doctorMeta}>
            {d.specialization} · {d.department}
          </Text>
        </Pressable>
      ))}

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-09-18" />

      <Text style={styles.label}>Reason (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="Briefly describe your symptoms"
      />

      <Pressable style={styles.button} onPress={handleBook} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirm Booking</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 8 },
  doctorCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  doctorCardActive: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  doctorName: { fontWeight: '600', fontSize: 15, color: colors.ink },
  doctorMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
