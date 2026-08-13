import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMobileStorage } from '../storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('createMobileStorage', () => {
  it('reads a value through AsyncStorage.getItem', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('stored-value');

    const result = await createMobileStorage().getItem('autocards.decks');

    expect(result).toBe('stored-value');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('autocards.decks');
  });

  it('returns null when AsyncStorage has no value for the key', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const result = await createMobileStorage().getItem('missing-key');

    expect(result).toBeNull();
  });

  it('writes a value through AsyncStorage.setItem', async () => {
    await createMobileStorage().setItem('autocards.decks', '[]');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('autocards.decks', '[]');
  });

  it('removes a value through AsyncStorage.removeItem', async () => {
    await createMobileStorage().removeItem('autocards.decks');

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('autocards.decks');
  });
});
