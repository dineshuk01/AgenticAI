
import numpy as np

class TicTacToe:
    def __init__(self):
        self.board = np.full((3, 3), ' ')
        self.current_player = 'X'

    def print_board(self):
        print('
'.join(['|'.join(row) for row in self.board]))

    def make_move(self, row, col):
        if self.board[row, col] == ' ':
            self.board[row, col] = self.current_player
            if self.check_winner():
                print(f'Player {self.current_player} wins!')
                return True
            self.current_player = 'O' if self.current_player == 'X' else 'X'
            return False
        else:
            print('Invalid move!')
            return False

    def check_winner(self):
        for row in range(3):
            if np.all(self.board[row] == self.current_player):
                return True
        for col in range(3):
            if np.all(self.board[:, col] == self.current_player):
                return True
        if np.all(np.diag(self.board) == self.current_player) or np.all(np.diag(np.fliplr(self.board)) == self.current_player):
            return True
        return False

    def is_full(self):
        return np.all(self.board != ' ')

    def play(self):
        while True:
            self.print_board()
            row = int(input(f'Player {self.current_player}, enter your move row (0-2): '))
            col = int(input(f'Player {self.current_player}, enter your move column (0-2): '))
            if self.make_move(row, col):
                self.print_board()
                break
            if self.is_full():
                print('The game is a draw!')
                self.print_board()
                break

if __name__ == '__main__':
    game = TicTacToe()
    game.play()
